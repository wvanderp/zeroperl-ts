import { WASI, WASIProcExit } from "./wasi";
import { instantiate } from "./wasi/asyncify";
import { useArgs, useClock, useEnviron, useProc, useRandom, useMemoryFS } from "./wasi";
import type { WASIOptions } from "./wasi/options";
import { MemoryFileSystem } from "./wasi/features/fd";
import zeroperl from './zeroperl.wasm';
export { MemoryFileSystem } from "./wasi/features/fd";

/**
 * @fileoverview ZeroPerl - Perl interpreter for WebAssembly
 * 
 * @example
 * Evaluate Perl code:
 * ```typescript
 * import { ZeroPerl } from "./zeroperl";
 * 
 * const perl = await ZeroPerl.create();
 * await perl.eval('print "Hello, World!\n"');
 * await perl.dispose();
 * ```
 * 
 * @example
 * Run a Perl script with filesystem:
 * ```typescript
 * import { ZeroPerl, MemoryFileSystem } from "./zeroperl";
 * 
 * const fileSystem = new MemoryFileSystem({ "/": "" });
 * fileSystem.addFile("/script.pl", perlScript);
 * fileSystem.addFile("/data.txt", myData);
 * 
 * const perl = await ZeroPerl.create({
 *   fileSystem,
 *   stdout: (data) => console.log(data),
 *   stderr: (data) => console.error(data)
 * });
 * 
 * await perl.runFile('/script.pl');
 * await perl.dispose();
 * ```
 * 
 * @example
 * Evaluate code with arguments:
 * ```typescript
 * const perl = await ZeroPerl.create();
 * 
 * // Arguments accessible via @ARGV
 * await perl.eval('print "Args: @ARGV\n"', ['arg1', 'arg2']);
 * 
 * await perl.dispose();
 * ```
 */

/**
 * WebAssembly exports interface for ZeroPerl
 */
interface ZeroPerlExports extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    malloc: (size: number) => Promise<number>;
    free: (ptr: number) => Promise<void>;
    zeroperl_init: () => Promise<number>;
    zeroperl_init_with_args: (argc: number, argv: number) => Promise<number>;
    zeroperl_eval: (code_ptr: number, argc: number, argv: number) => Promise<number>;
    zeroperl_run_file: (filepath_ptr: number, argc: number, argv: number) => Promise<number>;
    zeroperl_reset: () => Promise<number>;
    zeroperl_free_interpreter: () => Promise<void>;
    zeroperl_shutdown: () => Promise<void>;
    zeroperl_get_sv: (name_ptr: number) => Promise<number>;
    zeroperl_set_sv: (name_ptr: number, value_ptr: number) => Promise<void>;
    zeroperl_last_error: () => Promise<number>;
    zeroperl_clear_error: () => Promise<void>;
    zeroperl_is_initialized: () => Promise<number>;
    zeroperl_can_evaluate: () => Promise<number>;
    zeroperl_flush: () => Promise<number>;
}

/**
 * Custom fetch implementation type
 */
type FetchLike = (...args: unknown[]) => Promise<Response>;

/**
 * Custom error class for ZeroPerl operations
 */
export class ZeroPerlError extends Error {
    readonly exitCode?: number;
    readonly perlError?: string;

    constructor(message: string, exitCode?: number, perlError?: string) {
        super(message);
        this.name = 'ZeroPerlError';
        this.exitCode = exitCode;
        this.perlError = perlError;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ZeroPerlError);
        }
    }
}

/**
 * Options for creating a ZeroPerl instance
 */
export interface ZeroPerlOptions {
    /** Environment variables to pass to Perl */
    env?: Record<string, string>;

    /** 
     * Virtual filesystem to provide to Perl
     * 
     * @example
     * ```typescript
     * const fs = new MemoryFileSystem({ "/": "" });
     * fs.addFile("/script.pl", perlCode);
     * fs.addFile("/data.json", jsonData);
     * ```
     */
    fileSystem?: MemoryFileSystem;

    /** Capture stdout output */
    stdout?: (data: string | Uint8Array) => void;

    /** Capture stderr output */
    stderr?: (data: string | Uint8Array) => void;

    /** Custom fetch implementation for loading the WASM module */
    fetch?: FetchLike;
}

/**
 * Result of a Perl evaluation or file execution
 */
export interface ZeroPerlResult {
    /** True if operation succeeded */
    success: boolean;
    /** Error message if operation failed */
    error?: string;
    /** Exit code from the operation */
    exitCode: number;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

// Cache for the WASM source using WeakRef
let wasmSourceCache: WeakRef<ArrayBuffer> | null = null;

/**
 * Detect if running in a browser environment
 */
function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Load WASM module source for the current runtime (with caching)
 */
async function loadWasmSource(fetchFn?: FetchLike): Promise<ArrayBuffer> {
    if (wasmSourceCache) {
        const cached = wasmSourceCache.deref();
        if (cached) {
            return cached;
        }
    }

    let moduleData: ArrayBuffer;

    if (isBrowser()) {
        const f = fetchFn ?? fetch;
        const response = await f(zeroperl);
        moduleData = await response.arrayBuffer();
    } else {
        // Resolve the WASM path relative to this module using import.meta.url
        const wasmUrl = new URL(zeroperl, import.meta.url);
        const wasmPath = wasmUrl.pathname;

        //@ts-expect-error Deno
        if (typeof Deno !== "undefined") {
            //@ts-expect-error Deno
            moduleData = (await Deno.readFile(wasmPath)).buffer;
        }
        else if (typeof Bun !== "undefined") {
            const file = Bun.file(wasmPath);
            moduleData = await file.arrayBuffer();
        }
        else {
            const { readFile } = await import("node:fs/promises");
            moduleData = (await readFile(wasmPath)).buffer;
        }
    }

    wasmSourceCache = new WeakRef(moduleData);
    return moduleData;
}

/**
 * ZeroPerl - Perl interpreter for WebAssembly
 * 
 * Provides a managed interface to the Perl interpreter running in WebAssembly.
 * Create an instance and use it for evaluating Perl code or running Perl scripts.
 * 
 * @example
 * Basic evaluation:
 * ```typescript
 * const perl = await ZeroPerl.create();
 * await perl.eval('print "Hello, World!\n"');
 * await perl.dispose();
 * ```
 * 
 * @example
 * With custom filesystem:
 * ```typescript
 * import { ZeroPerl, MemoryFileSystem } from "./zeroperl";
 * 
 * const fs = new MemoryFileSystem({ "/": "" });
 * fs.addFile("/script.pl", 'print "Hello from file!\n"');
 * fs.addFile("/data.txt", "some data");
 * 
 * const perl = await ZeroPerl.create({ fileSystem: fs });
 * await perl.runFile('/script.pl');
 * ```
 * 
 * @example
 * Working with variables:
 * ```typescript
 * const perl = await ZeroPerl.create();
 * 
 * await perl.setVariable('name', 'Alice');
 * const name = await perl.getVariable('name');
 * 
 * await perl.eval('print "Hello, $name!\n"');
 * await perl.dispose();
 * ```
 */
export class ZeroPerl {
    private wasi: WASI;
    private exports: ZeroPerlExports;
    private isDisposed = false;

    private constructor(wasi: WASI, exports: ZeroPerlExports) {
        this.wasi = wasi;
        this.exports = exports;
    }

    /**
     * Create a new ZeroPerl instance
     * 
     * Handles WASM loading, WASI setup, asyncify wrapping, and initialization internally.
     * The instance is ready for eval() calls immediately after creation.
     * 
     * @param options Configuration options
     * @returns New ZeroPerl instance ready to use
     * 
     * @throws {ZeroPerlError} If initialization fails
     * 
     * @example
     * Basic usage:
     * ```typescript
     * const perl = await ZeroPerl.create();
     * ```
     * 
     * @example
     * With output capture:
     * ```typescript
     * const perl = await ZeroPerl.create({
     *   env: { MY_VAR: 'value' },
     *   stdout: (data) => console.log(data),
     *   stderr: (data) => console.error(data)
     * });
     * ```
     * 
     * @example
     * With custom filesystem:
     * ```typescript
     * import { ZeroPerl, MemoryFileSystem } from "./zeroperl";
     * 
     * const fs = new MemoryFileSystem({ "/": "" });
     * fs.addFile("/script.pl", perlScriptContent);
     * fs.addFile("/data.txt", fileData);
     * 
     * const perl = await ZeroPerl.create({ fileSystem: fs });
     * ```
     */
    static async create(options: ZeroPerlOptions = {}): Promise<ZeroPerl> {
        const source = await loadWasmSource(options.fetch);

        const fileSystem = options.fileSystem || new MemoryFileSystem({ "/": "" });

        const wasiOptions: WASIOptions = {
            env: options.env || {},
            args: ['zeroperl'],
            features: [
                useEnviron,
                useArgs,
                useRandom,
                useClock,
                useProc,
                useMemoryFS({
                    withFileSystem: fileSystem,
                    withStdIo: {
                        stdout: (data) => {
                            if (options.stdout) {

                                options.stdout(data);
                            }
                        },
                        stderr: (data) => {
                            if (options.stderr) {
                                options.stderr(data);
                            }
                        },
                    },
                }),
            ],
        };

        const wasi = new WASI(wasiOptions);

        const { instance } = await instantiate(source, {
            wasi_snapshot_preview1: wasi.wasiImport,
        });

        await wasi.initialize(instance);

        const exports = wasi.exports as ZeroPerlExports;

        const required = [
            'memory', 'malloc', 'free',
            'zeroperl_init', 'zeroperl_init_with_args', 'zeroperl_eval',
            'zeroperl_run_file', 'zeroperl_reset',
            'zeroperl_free_interpreter', 'zeroperl_shutdown',
            'zeroperl_get_sv', 'zeroperl_set_sv',
            'zeroperl_last_error', 'zeroperl_clear_error',
            'zeroperl_is_initialized', 'zeroperl_can_evaluate',
            'zeroperl_flush'
        ];

        for (const name of required) {
            if (!(name in exports)) {
                throw new ZeroPerlError(`Missing required export: ${name}`);
            }
        }

        const perl = new ZeroPerl(wasi, exports);

        // Initialize in interactive mode (ready for eval)
        const result = await perl.exports.zeroperl_init();
        if (result !== 0) {
            const error = await perl.getLastError();
            throw new ZeroPerlError('Failed to initialize Perl interpreter', result, error);
        }

        return perl;
    }

    /**
     * Write a null-terminated C string to WASM memory
     */
    private async writeCString(str: string): Promise<number> {
        const bytes = textEncoder.encode(str + '\0');
        const ptr = await this.exports.malloc(bytes.length);
        const view = new Uint8Array(this.exports.memory.buffer);
        view.set(bytes, ptr);
        return ptr;
    }

    /**
     * Read a null-terminated C string from WASM memory
     */
    private readCString(ptr: number): string {
        if (ptr === 0) return '';

        const view = new Uint8Array(this.exports.memory.buffer);
        let len = 0;
        while (view[ptr + len] !== 0) {
            len++;
        }

        return textDecoder.decode(view.subarray(ptr, ptr + len));
    }

    /**
     * Write an array of strings as argv (char**) to WASM memory
     */
    private async writeStringArray(args: string[]): Promise<{ argv: number; buffers: number[] }> {
        const buffers: number[] = [];

        const argv = await this.exports.malloc(args.length * 4);
        const argvView = new DataView(this.exports.memory.buffer);

        for (let i = 0; i < args.length; i++) {
            const strPtr = await this.writeCString(args[i]!);
            buffers.push(strPtr);
            argvView.setUint32(argv + i * 4, strPtr, true);
        }

        return { argv, buffers };
    }

    /**
     * Free an array of string buffers and the argv array
     */
    private async freeStringArray(argv: number, buffers: number[]): Promise<void> {
        for (const buf of buffers) {
            await this.exports.free(buf);
        }
        await this.exports.free(argv);
    }

    /**
     * Evaluate a string of Perl code
     * 
     * Optionally accepts command-line arguments that will be available in @ARGV.
     * 
     * @param code Perl code to evaluate
     * @param args Optional command-line arguments (accessible via @ARGV in Perl)
     * @returns Result of the evaluation
     * 
     * @example
     * Simple evaluation:
     * ```typescript
     * const result = await perl.eval('$x = 42; print "$x\n"');
     * if (!result.success) {
     *   console.error(result.error);
     * }
     * ```
     * 
     * @example
     * With arguments:
     * ```typescript
     * await perl.eval('print "Args: @ARGV\n"', ['arg1', 'arg2']);
     * ```
     */
    async eval(code: string, args: string[] = []): Promise<ZeroPerlResult> {
        this.checkDisposed();

        const codePtr = await this.writeCString(code);

        let argv = 0;
        let buffers: number[] = [];

        if (args.length > 0) {
            const result = await this.writeStringArray(args);
            argv = result.argv;
            buffers = result.buffers;
        }

        try {
            const exitCode = await this.exports.zeroperl_eval(codePtr, args.length, argv);

            if (exitCode !== 0) {
                const error = await this.getLastError();
                return { success: false, error, exitCode };
            }

            return { success: true, exitCode: 0 };
        } catch (e) {
            if (e instanceof WASIProcExit) {
                if (e.code !== 0) {
                    const error = await this.getLastError();
                    return { success: false, error, exitCode: e.code };
                } else {
                    return { success: true, exitCode: 0 };
                }
            }
            throw e;
        } finally {
            await this.exports.free(codePtr);
            if (buffers.length > 0) {
                await this.freeStringArray(argv, buffers);
            }
        }
    }

    /**
     * Run a Perl script file
     * 
     * Loads and executes a Perl script from the filesystem using Perl's do operator.
     * The script path must exist in the virtual filesystem.
     * 
     * @param scriptPath Path to the Perl script
     * @param args Optional command-line arguments for the script (accessible via @ARGV)
     * @returns Result of the script execution
     * 
     * @example
     * ```typescript
     * // Run a script
     * const result = await perl.runFile('/script.pl');
     * 
     * // Run a script with arguments
     * const result = await perl.runFile('/script.pl', ['arg1', 'arg2']);
     * 
     * // Check result
     * if (!result.success) {
     *   console.error(`Script failed: ${result.error}`);
     * }
     * ```
     */
    async runFile(scriptPath: string, args: string[] = []): Promise<ZeroPerlResult> {
        this.checkDisposed();

        const pathPtr = await this.writeCString(scriptPath);

        let argv = 0;
        let buffers: number[] = [];

        if (args.length > 0) {
            const result = await this.writeStringArray(args);
            argv = result.argv;
            buffers = result.buffers;
        }

        try {
            const exitCode = await this.exports.zeroperl_run_file(pathPtr, args.length, argv);

            if (exitCode !== 0) {
                const error = await this.getLastError();
                return { success: false, error, exitCode };
            }

            return { success: true, exitCode: 0 };
        } catch (e) {
            if (e instanceof WASIProcExit) {
                if (e.code !== 0) {
                    const error = await this.getLastError();
                    return { success: false, error, exitCode: e.code };
                } else {
                    return { success: true, exitCode: 0 };
                }
            }
            throw e;
        } finally {
            await this.exports.free(pathPtr);
            if (buffers.length > 0) {
                await this.freeStringArray(argv, buffers);
            }
        }
    }

    /**
     * Reset the interpreter to a clean state
     * 
     * Destructs and reconstructs the interpreter, clearing all Perl state.
     * After reset, the interpreter is ready for eval() calls.
     * 
     * @throws {ZeroPerlError} If reset fails
     * 
     * @example
     * ```typescript
     * await perl.eval('$x = 42');
     * await perl.reset();
     * await perl.eval('print $x'); // $x is undefined now
     * ```
     */
    async reset(): Promise<void> {
        this.checkDisposed();

        const result = await this.exports.zeroperl_reset();
        if (result !== 0) {
            const error = await this.getLastError();
            throw new ZeroPerlError('Failed to reset Perl interpreter', result, error);
        }
    }

    /**
     * Flush STDOUT and STDERR buffers
     * 
     * Forces any buffered output to be written immediately. Useful when you need
     * to ensure output is visible before a long-running operation or for real-time
     * logging without enabling full autoflush mode.
     * 
     * @throws {ZeroPerlError} If flush operation fails
     * 
     * @example
     * Manual flushing during a loop:
     * ```typescript
     * for (let i = 0; i < 10; i++) {
     *   await perl.eval('print "."');
     *   await perl.flush(); // Show progress immediately
     *   // ... do work ...
     * }
     * ```
     * 
     * @example
     * Flush before critical operations:
     * ```typescript
     * await perl.eval('print "Starting critical section..."');
     * await perl.flush(); // Ensure message is written
     * // ... risky operation ...
     * ```
     */
    async flush(): Promise<void> {
        this.checkDisposed();

        const result = await this.exports.zeroperl_flush();
        if (result !== 0) {
            throw new ZeroPerlError('Failed to flush output buffers', result);
        }
    }

    /**
     * Get a Perl scalar variable value as a string
     * 
     * @param name Variable name without the $ sigil (e.g., "myvar" not "$myvar")
     * @returns Variable value, or null if not found
     * 
     * @example
     * ```typescript
     * await perl.eval('$myvar = "hello"');
     * const value = await perl.getVariable('myvar'); // "hello"
     * ```
     */
    async getVariable(name: string): Promise<string | null> {
        this.checkDisposed();

        const namePtr = await this.writeCString(name);
        try {
            const valuePtr = await this.exports.zeroperl_get_sv(namePtr);
            if (valuePtr === 0) {
                return null;
            }
            return this.readCString(valuePtr);
        } finally {
            await this.exports.free(namePtr);
        }
    }

    /**
     * Set a Perl scalar variable from a string
     * 
     * Creates the variable if it doesn't exist.
     * 
     * @param name Variable name without the $ sigil
     * @param value Value to set
     * 
     * @example
     * ```typescript
     * await perl.setVariable('name', 'Alice');
     * await perl.eval('print "Hello, $name!\n"'); // prints: Hello, Alice!
     * ```
     */
    async setVariable(name: string, value: string): Promise<void> {
        this.checkDisposed();

        const namePtr = await this.writeCString(name);
        const valuePtr = await this.writeCString(value);
        try {
            await this.exports.zeroperl_set_sv(namePtr, valuePtr);
        } finally {
            await this.exports.free(namePtr);
            await this.exports.free(valuePtr);
        }
    }

    /**
     * Get the last error message from Perl ($@)
     * 
     * @returns Error message, or empty string if no error
     */
    async getLastError(): Promise<string> {
        this.checkDisposed();

        const errorPtr = await this.exports.zeroperl_last_error();
        return this.readCString(errorPtr);
    }

    /**
     * Clear the error state ($@)
     */
    async clearError(): Promise<void> {
        this.checkDisposed();
        await this.exports.zeroperl_clear_error();
    }

    /**
     * Check if the interpreter is initialized
     * 
     * @returns True if initialized
     */
    async isInitialized(): Promise<boolean> {
        this.checkDisposed();
        const result = await this.exports.zeroperl_is_initialized();
        return result !== 0;
    }

    /**
     * Check if the interpreter is ready to evaluate code
     * 
     * @returns True if ready for eval() calls
     */
    async canEvaluate(): Promise<boolean> {
        this.checkDisposed();
        const result = await this.exports.zeroperl_can_evaluate();
        return result !== 0;
    }

    /**
     * Dispose of the Perl interpreter
     * 
     * Frees the interpreter but leaves the Perl system initialized.
     * After calling dispose(), this instance cannot be used anymore.
     * For complete cleanup, use shutdown() instead.
     */
    async dispose(): Promise<void> {
        if (this.isDisposed) return;

        await this.exports.zeroperl_free_interpreter();
        this.isDisposed = true;
    }

    /**
     * Shutdown the Perl system completely
     * 
     * Performs complete system cleanup including interpreter disposal
     * and Perl system termination. Should only be called once at program exit.
     * After this, the instance cannot be used anymore.
     */
    async shutdown(): Promise<void> {
        if (this.isDisposed) return;

        await this.exports.zeroperl_shutdown();
        this.isDisposed = true;
    }

    /**
     * Check if this instance has been disposed
     */
    private checkDisposed(): void {
        if (this.isDisposed) {
            throw new ZeroPerlError('ZeroPerl instance has been disposed');
        }
    }
}