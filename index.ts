import {
    useArgs,
    useClock,
    useEnviron,
    useMemoryFS,
    useProc,
    useRandom,
    WASI,
    WASIProcExit,
} from "./wasi";
import { instantiate } from "./wasi/asyncify";
import { MemoryFileSystem } from "./wasi/features/fd";
import type { WASIOptions } from "./wasi/options";
import zeroperl from "./zeroperl.wasm";

export { MemoryFileSystem } from "./wasi/features/fd";

/**
 * @fileoverview Perl interpreter for WebAssembly.
 *
 * Provides a JavaScript interface to a Perl interpreter running in WebAssembly.
 * Supports Perl value manipulation, arrays, hashes, references, and bidirectional
 * function calls between JavaScript and Perl.
 *
 * @example
 * Basic usage:
 * ```typescript
 * import { ZeroPerl } from "./zeroperl";
 *
 * const perl = await ZeroPerl.create();
 * await perl.eval('print "Hello, World!\n"');
 * await perl.dispose();
 * ```
 *
 * @example
 * Working with data structures:
 * ```typescript
 * const perl = await ZeroPerl.create();
 *
 * // Create hash
 * const hash = await perl.createHash({
 *   name: 'Alice',
 *   age: 30,
 *   active: true
 * });
 *
 * // Create array
 * const arr = await perl.createArray([1, 2, 3, "hello"]);
 *
 * // Convert to JavaScript
 * const obj = await hash.project(); // { name: 'Alice', age: 30, active: true }
 * const jsArr = await arr.project(); // [1, 2, 3, "hello"]
 *
 * await hash.dispose();
 * await arr.dispose();
 * await perl.dispose();
 * ```
 *
 * @example
 * Calling JavaScript from Perl:
 * ```typescript
 * const perl = await ZeroPerl.create();
 *
 * await perl.registerFunction('greet', async (name) => {
 *   const nameStr = await name.toString();
 *   console.log(`Hello, ${nameStr}!`);
 *   return await perl.createString(`Greeted ${nameStr}`);
 * });
 *
 * await perl.eval('greet("Alice")');
 * await perl.dispose();
 * ```
 */

/**
 * Perl value types.
 */
export type PerlValueType =
    | "undef"
    | "true"
    | "false"
    | "int"
    | "double"
    | "string"
    | "array"
    | "hash"
    | "code"
    | "ref";

/**
 * Perl calling context.
 */
export type PerlContext = "void" | "scalar" | "list";

/**
 * JavaScript values that can be converted to Perl values.
 */
export type PerlConvertible =
    | PerlValue
    | string
    | number
    | boolean
    | null
    | undefined
    | PerlConvertible[]
    | { [key: string]: PerlConvertible };

/**
 * JavaScript primitive types that Perl values can be converted to.
 */
export type JSPrimitive = string | number | boolean | null | undefined;

/**
 * WebAssembly exports interface for ZeroPerl.
 * @private
 */
interface ZeroPerlExports extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    malloc: (size: number) => Promise<number>;
    free: (ptr: number) => Promise<void>;

    zeroperl_init: () => Promise<number>;
    zeroperl_init_with_args: (argc: number, argv: number) => Promise<number>;
    zeroperl_free_interpreter: () => Promise<void>;
    zeroperl_shutdown: () => Promise<void>;
    zeroperl_reset: () => Promise<number>;

    zeroperl_eval: (
        code_ptr: number,
        context: number,
        argc: number,
        argv: number,
    ) => Promise<number>;
    zeroperl_run_file: (
        filepath_ptr: number,
        argc: number,
        argv: number,
    ) => Promise<number>;

    zeroperl_last_error: () => Promise<number>;
    zeroperl_clear_error: () => Promise<void>;

    zeroperl_is_initialized: () => Promise<number>;
    zeroperl_can_evaluate: () => Promise<number>;
    zeroperl_flush: () => Promise<number>;

    zeroperl_new_int: (i: number) => Promise<number>;
    zeroperl_new_uint: (u: number) => Promise<number>;
    zeroperl_new_double: (d: number) => Promise<number>;
    zeroperl_new_string: (str_ptr: number, len: number) => Promise<number>;
    zeroperl_new_bool: (b: number) => Promise<number>;
    zeroperl_new_undef: () => Promise<number>;

    zeroperl_to_int: (val_ptr: number, out_ptr: number) => Promise<number>;
    zeroperl_to_double: (val_ptr: number, out_ptr: number) => Promise<number>;
    zeroperl_to_string: (val_ptr: number, len_ptr: number) => Promise<number>;
    zeroperl_to_bool: (val_ptr: number) => Promise<number>;
    zeroperl_is_undef: (val_ptr: number) => Promise<number>;
    zeroperl_get_type: (val_ptr: number) => Promise<number>;

    zeroperl_incref: (val_ptr: number) => Promise<void>;
    zeroperl_decref: (val_ptr: number) => Promise<void>;
    zeroperl_value_free: (val_ptr: number) => Promise<void>;

    zeroperl_new_array: () => Promise<number>;
    zeroperl_array_push: (arr_ptr: number, val_ptr: number) => Promise<void>;
    zeroperl_array_pop: (arr_ptr: number) => Promise<number>;
    zeroperl_array_get: (arr_ptr: number, index: number) => Promise<number>;
    zeroperl_array_set: (
        arr_ptr: number,
        index: number,
        val_ptr: number,
    ) => Promise<number>;
    zeroperl_array_length: (arr_ptr: number) => Promise<number>;
    zeroperl_array_clear: (arr_ptr: number) => Promise<void>;
    zeroperl_array_to_value: (arr_ptr: number) => Promise<number>;
    zeroperl_value_to_array: (val_ptr: number) => Promise<number>;
    zeroperl_array_free: (arr_ptr: number) => Promise<void>;

    zeroperl_new_hash: () => Promise<number>;
    zeroperl_hash_set: (
        hash_ptr: number,
        key_ptr: number,
        val_ptr: number,
    ) => Promise<number>;
    zeroperl_hash_get: (hash_ptr: number, key_ptr: number) => Promise<number>;
    zeroperl_hash_exists: (hash_ptr: number, key_ptr: number) => Promise<number>;
    zeroperl_hash_delete: (hash_ptr: number, key_ptr: number) => Promise<number>;
    zeroperl_hash_clear: (hash_ptr: number) => Promise<void>;
    zeroperl_hash_iter_new: (hash_ptr: number) => Promise<number>;
    zeroperl_hash_iter_next: (
        iter_ptr: number,
        key_out_ptr: number,
        val_out_ptr: number,
    ) => Promise<number>;
    zeroperl_hash_iter_free: (iter_ptr: number) => Promise<void>;
    zeroperl_hash_to_value: (hash_ptr: number) => Promise<number>;
    zeroperl_value_to_hash: (val_ptr: number) => Promise<number>;
    zeroperl_hash_free: (hash_ptr: number) => Promise<void>;

    zeroperl_new_ref: (val_ptr: number) => Promise<number>;
    zeroperl_deref: (ref_ptr: number) => Promise<number>;
    zeroperl_is_ref: (val_ptr: number) => Promise<number>;

    zeroperl_get_var: (name_ptr: number) => Promise<number>;
    zeroperl_get_array_var: (name_ptr: number) => Promise<number>;
    zeroperl_get_hash_var: (name_ptr: number) => Promise<number>;
    zeroperl_set_var: (name_ptr: number, val_ptr: number) => Promise<number>;

    zeroperl_register_function: (
        func_id: number,
        name_ptr: number,
    ) => Promise<void>;
    zeroperl_register_method: (
        func_id: number,
        package_ptr: number,
        method_ptr: number,
    ) => Promise<void>;

    zeroperl_call: (
        name_ptr: number,
        context: number,
        argc: number,
        argv: number,
    ) => Promise<number>;
    zeroperl_result_get: (result_ptr: number, index: number) => Promise<number>;
    zeroperl_result_free: (result_ptr: number) => Promise<void>;

    zeroperl_set_host_error: (error_ptr: number) => Promise<void>;
    zeroperl_get_host_error: () => Promise<number>;
    zeroperl_clear_host_error: () => Promise<void>;
}

/**
 * Custom fetch implementation type.
 * @private
 */
type FetchLike = (...args: unknown[]) => Promise<Response>;

/**
 * Function type that can be registered as a Perl function.
 * 
 * Receives Perl values as arguments and returns a Perl value or void.
 */
export type HostFunction = (
    ...args: PerlValue[]
) => PerlValue | Promise<PerlValue> | void | Promise<void>;

/**
 * Error class for ZeroPerl operations.
 */
export class ZeroPerlError extends Error {
    readonly exitCode?: number;
    readonly perlError?: string;

    constructor(message: string, exitCode?: number, perlError?: string) {
        super(message);
        this.name = "ZeroPerlError";
        this.exitCode = exitCode;
        this.perlError = perlError;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ZeroPerlError);
        }
    }
}

/**
 * Options for creating a ZeroPerl instance.
 */
export interface ZeroPerlOptions {
    /** Environment variables to pass to Perl */
    env?: Record<string, string>;
    /** Virtual filesystem to provide to Perl */
    fileSystem?: MemoryFileSystem;
    /** Callback for stdout output */
    stdout?: (data: string | Uint8Array) => void;
    /** Callback for stderr output */
    stderr?: (data: string | Uint8Array) => void;
    /** Custom fetch implementation for loading the WASM module */
    fetch?: FetchLike;
}

/**
 * Result of a Perl evaluation or file execution.
 */
export interface ZeroPerlResult {
    /** Whether the operation succeeded */
    success: boolean;
    /** Error message if operation failed */
    error?: string;
    /** Exit code from the operation */
    exitCode: number;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

let wasmSourceCache: WeakRef<ArrayBuffer> | null = null;

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
}

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
        const wasmUrl = new URL(zeroperl, import.meta.url);
        const wasmPath = wasmUrl.pathname;

        //@ts-expect-error Deno
        if (typeof Deno !== "undefined") {
            //@ts-expect-error Deno
            moduleData = (await Deno.readFile(wasmPath)).buffer;
        } else if (typeof Bun !== "undefined") {
            const file = Bun.file(wasmPath);
            moduleData = await file.arrayBuffer();
        } else {
            const { readFile } = await import("node:fs/promises");
            moduleData = (await readFile(wasmPath)).buffer;
        }
    }

    wasmSourceCache = new WeakRef(moduleData);
    return moduleData;
}

function mapPerlType(typeCode: number): PerlValueType {
    const types: PerlValueType[] = [
        "undef",
        "true",
        "false",
        "int",
        "double",
        "string",
        "array",
        "hash",
        "code",
        "ref",
    ];
    return types[typeCode] || "undef";
}

function mapContext(context: PerlContext): number {
    const contexts: Record<PerlContext, number> = {
        void: 0,
        scalar: 1,
        list: 2,
    };
    return contexts[context];
}

/**
 * Wrapper for Perl scalar values.
 *
 * Represents any Perl scalar value (integers, floats, strings, references, etc).
 * Provides conversion methods to JavaScript types.
 *
 * Memory must be explicitly freed by calling dispose().
 *
 * @example
 * ```typescript
 * const num = await perl.createInt(42);
 * console.log(await num.getType()); // 'int'
 * console.log(await num.toInt()); // 42
 * console.log(await num.toString()); // "42"
 * console.log(await num.project()); // 42
 * await num.dispose();
 * ```
 */
export class PerlValue {
    private ptr: number;
    private exports: ZeroPerlExports;
    private disposed = false;

    /** @internal */
    constructor(ptr: number, exports: ZeroPerlExports) {
        this.ptr = ptr;
        this.exports = exports;
    }

    /** @internal */
    getPtr(): number {
        this.checkDisposed();
        return this.ptr;
    }

    /**
     * Convert value to a 32-bit integer.
     * 
     * @throws {ZeroPerlError} If conversion fails
     */
    async toInt(): Promise<number> {
        this.checkDisposed();
        const outPtr = await this.exports.malloc(4);
        try {
            const success =
                (await this.exports.zeroperl_to_int(this.ptr, outPtr)) !== 0;
            if (!success) {
                throw new ZeroPerlError("Failed to convert value to int");
            }
            const view = new DataView(this.exports.memory.buffer);
            return view.getInt32(outPtr, true);
        } finally {
            await this.exports.free(outPtr);
        }
    }

    /**
     * Convert value to a double-precision float.
     * 
     * @throws {ZeroPerlError} If conversion fails
     */
    async toDouble(): Promise<number> {
        this.checkDisposed();
        const outPtr = await this.exports.malloc(8);
        try {
            const success =
                (await this.exports.zeroperl_to_double(this.ptr, outPtr)) !== 0;
            if (!success) {
                throw new ZeroPerlError("Failed to convert value to double");
            }
            const view = new DataView(this.exports.memory.buffer);
            return view.getFloat64(outPtr, true);
        } finally {
            await this.exports.free(outPtr);
        }
    }

    /**
     * Convert value to a UTF-8 string.
     */
    async toString(): Promise<string> {
        this.checkDisposed();
        const lenPtr = await this.exports.malloc(4);
        try {
            const strPtr = await this.exports.zeroperl_to_string(this.ptr, lenPtr);
            if (strPtr === 0) {
                return "";
            }
            const view = new DataView(this.exports.memory.buffer);
            const len = view.getUint32(lenPtr, true);
            const bytes = new Uint8Array(this.exports.memory.buffer, strPtr, len);
            return textDecoder.decode(bytes);
        } finally {
            await this.exports.free(lenPtr);
        }
    }

    /**
     * Convert value to a boolean using Perl's truth test.
     */
    async toBoolean(): Promise<boolean> {
        this.checkDisposed();
        const result = await this.exports.zeroperl_to_bool(this.ptr);
        return result !== 0;
    }

    /**
     * Check if value is undefined.
     */
    async isUndef(): Promise<boolean> {
        this.checkDisposed();
        const result = await this.exports.zeroperl_is_undef(this.ptr);
        return result !== 0;
    }

    /**
     * Check if value is a reference.
     */
    async isRef(): Promise<boolean> {
        this.checkDisposed();
        const result = await this.exports.zeroperl_is_ref(this.ptr);
        return result !== 0;
    }

    /**
     * Get the type of this value.
     */
    async getType(): Promise<PerlValueType> {
        this.checkDisposed();
        const typeCode = await this.exports.zeroperl_get_type(this.ptr);
        return mapPerlType(typeCode);
    }

    /**
     * Convert this Perl value to a JavaScript primitive.
     *
     * Conversion rules:
     * - undef → null
     * - int/double → number
     * - string → string
     * - true/false → boolean
     * - Other types → string representation
     *
     * @example
     * ```typescript
     * await perl.eval('$x = 42; $y = "hello"; $z = 1');
     *
     * const x = await perl.getVariable('x');
     * const y = await perl.getVariable('y');
     * const z = await perl.getVariable('z');
     *
     * console.log(await x.project()); // 42
     * console.log(await y.project()); // "hello"
     * console.log(await z.project()); // true
     * ```
     */
    async project(): Promise<JSPrimitive> {
        this.checkDisposed();

        if (await this.isUndef()) {
            return null;
        }

        const type = await this.getType();

        switch (type) {
            case 'true':
                return true;
            case 'false':
                return false;
            case "int":
            case "double":
                return await this.toDouble();
            case "string":
                return await this.toString();
            default:
                return await this.toString();
        }
    }

    /**
     * Create a reference to this value.
     * 
     * @throws {ZeroPerlError} If reference creation fails
     */
    async createRef(): Promise<PerlValue> {
        this.checkDisposed();
        const refPtr = await this.exports.zeroperl_new_ref(this.ptr);
        if (refPtr === 0) {
            throw new ZeroPerlError("Failed to create reference");
        }
        return new PerlValue(refPtr, this.exports);
    }

    /**
     * Dereference this value.
     * 
     * @throws {ZeroPerlError} If value is not a reference or dereferencing fails
     */
    async deref(): Promise<PerlValue> {
        this.checkDisposed();
        const derefPtr = await this.exports.zeroperl_deref(this.ptr);
        if (derefPtr === 0) {
            throw new ZeroPerlError("Failed to dereference value (not a reference?)");
        }
        return new PerlValue(derefPtr, this.exports);
    }

    /**
     * Increment the reference count.
     */
    async incref(): Promise<void> {
        this.checkDisposed();
        await this.exports.zeroperl_incref(this.ptr);
    }

    /**
     * Decrement the reference count.
     */
    async decref(): Promise<void> {
        this.checkDisposed();
        await this.exports.zeroperl_decref(this.ptr);
    }

    /**
     * Free this value's memory.
     * 
     * After calling dispose(), this value cannot be used.
     */
    async dispose(): Promise<void> {
        if (this.disposed) return;
        await this.exports.zeroperl_value_free(this.ptr);
        this.disposed = true;
    }

    private checkDisposed(): void {
        if (this.disposed) {
            throw new ZeroPerlError("PerlValue has been disposed");
        }
    }
}

/**
 * Wrapper for Perl arrays.
 *
 * Provides push/pop operations, indexing, iteration, and conversion
 * to/from JavaScript arrays.
 *
 * Memory must be explicitly freed by calling dispose().
 *
 * @example
 * ```typescript
 * // Create and manipulate
 * const arr = await perl.createArray();
 * await arr.push(1);
 * await arr.push("hello");
 * await arr.push(true);
 *
 * console.log(await arr.getLength()); // 3
 * const val = await arr.get(0);
 * console.log(await val?.toInt()); // 1
 *
 * await arr.dispose();
 * ```
 *
 * @example
 * ```typescript
 * // Create from JavaScript array
 * const arr = await perl.createArray([1, 2, 3, "hello", true]);
 * const jsArray = await arr.project(); // [1, 2, 3, "hello", true]
 * await arr.dispose();
 * ```
 *
 * @example
 * ```typescript
 * // Iteration
 * for await (const val of arr) {
 *   console.log(await val.project());
 *   await val.dispose();
 * }
 * ```
 */
export class PerlArray {
    private ptr: number;
    private exports: ZeroPerlExports;
    private perl: ZeroPerl;
    private disposed = false;

    /** @internal */
    constructor(ptr: number, exports: ZeroPerlExports, perl: ZeroPerl) {
        this.ptr = ptr;
        this.exports = exports;
        this.perl = perl;
    }

    /** @internal */
    getPtr(): number {
        this.checkDisposed();
        return this.ptr;
    }

    /**
     * Push a value onto the end of the array.
     */
    async push(value: PerlConvertible): Promise<void> {
        this.checkDisposed();
        const perlValue = await this.perl.toPerlValue(value);
        try {
            await this.exports.zeroperl_array_push(this.ptr, perlValue.getPtr());
        } finally {
            if (!(value instanceof PerlValue)) {
                await perlValue.dispose();
            }
        }
    }

    /**
     * Pop a value from the end of the array.
     * 
     * @returns The popped value, or null if array is empty
     */
    async pop(): Promise<PerlValue | null> {
        this.checkDisposed();
        const valPtr = await this.exports.zeroperl_array_pop(this.ptr);
        if (valPtr === 0) {
            return null;
        }
        return new PerlValue(valPtr, this.exports);
    }

    /**
     * Get a value at the specified index.
     * 
     * @returns The value at the index, or null if out of bounds
     */
    async get(index: number): Promise<PerlValue | null> {
        this.checkDisposed();
        const valPtr = await this.exports.zeroperl_array_get(this.ptr, index);
        if (valPtr === 0) {
            return null;
        }
        return new PerlValue(valPtr, this.exports);
    }

    /**
     * Set a value at the specified index.
     * 
     * @throws {ZeroPerlError} If index is invalid
     */
    async set(index: number, value: PerlConvertible): Promise<void> {
        this.checkDisposed();
        const perlValue = await this.perl.toPerlValue(value);
        try {
            const success = await this.exports.zeroperl_array_set(
                this.ptr,
                index,
                perlValue.getPtr(),
            );
            if (!success) {
                throw new ZeroPerlError(
                    `Failed to set array element at index ${index}`,
                );
            }
        } finally {
            if (!(value instanceof PerlValue)) {
                await perlValue.dispose();
            }
        }
    }

    /**
     * Get the length of the array.
     */
    async getLength(): Promise<number> {
        this.checkDisposed();
        return await this.exports.zeroperl_array_length(this.ptr);
    }

    /**
     * Clear all elements from the array.
     */
    async clear(): Promise<void> {
        this.checkDisposed();
        await this.exports.zeroperl_array_clear(this.ptr);
    }

    /**
     * Convert this array to a PerlValue (array reference).
     * 
     * @throws {ZeroPerlError} If conversion fails
     */
    async toValue(): Promise<PerlValue> {
        this.checkDisposed();
        const valPtr = await this.exports.zeroperl_array_to_value(this.ptr);
        if (valPtr === 0) {
            throw new ZeroPerlError("Failed to convert array to value");
        }
        return new PerlValue(valPtr, this.exports);
    }

    /**
     * Convert this Perl array to a JavaScript array.
     *
     * Each element is converted to a JavaScript primitive.
     *
     * @example
     * ```typescript
     * const arr = await perl.createArray();
     * await arr.push(42);
     * await arr.push("hello");
     * await arr.push(true);
     *
     * const jsArray = await arr.project(); // [42, "hello", true]
     * ```
     */
    async project(): Promise<JSPrimitive[]> {
        this.checkDisposed();
        const len = await this.getLength();
        const result: JSPrimitive[] = [];

        for (let i = 0; i < len; i++) {
            const val = await this.get(i);
            if (val) {
                result.push(await val.project());
                await val.dispose();
            } else {
                result.push(null);
            }
        }

        return result;
    }

    /**
     * Create a PerlArray from a PerlValue (must be an array reference).
     *
     * @internal
     */
    static async fromValue(
        value: PerlValue,
        perl: ZeroPerl,
    ): Promise<PerlArray | null> {
        const exports = (value as unknown as { exports: ZeroPerlExports }).exports;
        const arrPtr = await exports.zeroperl_value_to_array(value.getPtr());
        if (arrPtr === 0) {
            return null;
        }
        return new PerlArray(arrPtr, exports, perl);
    }

    /**
     * Iterate over all values in the array.
     */
    async *[Symbol.asyncIterator](): AsyncGenerator<PerlValue, void, undefined> {
        const len = await this.getLength();
        for (let i = 0; i < len; i++) {
            const val = await this.get(i);
            if (val) {
                yield val;
            }
        }
    }

    /**
     * Free this array's memory.
     * 
     * After calling dispose(), this array cannot be used.
     */
    async dispose(): Promise<void> {
        if (this.disposed) return;
        await this.exports.zeroperl_array_free(this.ptr);
        this.disposed = true;
    }

    private checkDisposed(): void {
        if (this.disposed) {
            throw new ZeroPerlError("PerlArray has been disposed");
        }
    }
}

/**
 * Wrapper for Perl hashes.
 *
 * Provides a Map-like interface with iteration methods and conversion
 * to/from JavaScript objects.
 *
 * Memory must be explicitly freed by calling dispose().
 *
 * @example
 * ```typescript
 * // Create and manipulate
 * const hash = await perl.createHash();
 * await hash.set('name', 'Alice');
 * await hash.set('age', 30);
 *
 * const name = await hash.get('name');
 * console.log(await name?.toString()); // "Alice"
 *
 * await hash.dispose();
 * ```
 *
 * @example
 * ```typescript
 * // Create from JavaScript object
 * const hash = await perl.createHash({
 *   name: 'Alice',
 *   age: 30,
 *   active: true
 * });
 *
 * const obj = await hash.project(); // { name: 'Alice', age: 30, active: true }
 * await hash.dispose();
 * ```
 *
 * @example
 * ```typescript
 * // Iteration
 * for await (const [key, val] of hash.entries()) {
 *   console.log(`${key}: ${await val.project()}`);
 *   await val.dispose();
 * }
 * ```
 */
export class PerlHash {
    private ptr: number;
    private exports: ZeroPerlExports;
    private perl: ZeroPerl;
    private disposed = false;

    /** @internal */
    constructor(ptr: number, exports: ZeroPerlExports, perl: ZeroPerl) {
        this.ptr = ptr;
        this.exports = exports;
        this.perl = perl;
    }

    /** @internal */
    getPtr(): number {
        this.checkDisposed();
        return this.ptr;
    }

    /**
     * Set a key-value pair in the hash.
     * 
     * @throws {ZeroPerlError} If setting the key fails
     */
    async set(key: string, value: PerlConvertible): Promise<void> {
        this.checkDisposed();
        const perlValue = await this.perl.toPerlValue(value);
        const keyPtr = await this.writeCString(key);
        try {
            const success =
                (await this.exports.zeroperl_hash_set(
                    this.ptr,
                    keyPtr,
                    perlValue.getPtr(),
                )) !== 0;
            if (!success) {
                throw new ZeroPerlError(`Failed to set hash key '${key}'`);
            }
        } finally {
            await this.exports.free(keyPtr);
            if (!(value instanceof PerlValue)) {
                await perlValue.dispose();
            }
        }
    }

    /**
     * Get a value by key.
     * 
     * @returns The value for the key, or null if key doesn't exist
     */
    async get(key: string): Promise<PerlValue | null> {
        this.checkDisposed();
        const keyPtr = await this.writeCString(key);
        try {
            const valPtr = await this.exports.zeroperl_hash_get(this.ptr, keyPtr);
            if (valPtr === 0) {
                return null;
            }
            return new PerlValue(valPtr, this.exports);
        } finally {
            await this.exports.free(keyPtr);
        }
    }

    /**
     * Check if a key exists in the hash.
     */
    async has(key: string): Promise<boolean> {
        this.checkDisposed();
        const keyPtr = await this.writeCString(key);
        try {
            const exists =
                (await this.exports.zeroperl_hash_exists(this.ptr, keyPtr)) !== 0;
            return exists;
        } finally {
            await this.exports.free(keyPtr);
        }
    }

    /**
     * Delete a key from the hash.
     * 
     * @returns true if key was deleted, false if key didn't exist
     */
    async delete(key: string): Promise<boolean> {
        this.checkDisposed();
        const keyPtr = await this.writeCString(key);
        try {
            const deleted =
                (await this.exports.zeroperl_hash_delete(this.ptr, keyPtr)) !== 0;
            return deleted;
        } finally {
            await this.exports.free(keyPtr);
        }
    }

    /**
     * Clear all entries from the hash.
     */
    async clear(): Promise<void> {
        this.checkDisposed();
        await this.exports.zeroperl_hash_clear(this.ptr);
    }

    /**
     * Convert this hash to a PerlValue (hash reference).
     * 
     * @throws {ZeroPerlError} If conversion fails
     */
    async toValue(): Promise<PerlValue> {
        this.checkDisposed();
        const valPtr = await this.exports.zeroperl_hash_to_value(this.ptr);
        if (valPtr === 0) {
            throw new ZeroPerlError("Failed to convert hash to value");
        }
        return new PerlValue(valPtr, this.exports);
    }

    /**
     * Convert this Perl hash to a JavaScript object.
     *
     * Each value is converted to a JavaScript primitive.
     *
     * @example
     * ```typescript
     * const hash = await perl.createHash();
     * await hash.set('name', 'Alice');
     * await hash.set('age', 30);
     * await hash.set('active', true);
     *
     * const obj = await hash.project(); // { name: 'Alice', age: 30, active: true }
     * ```
     */
    async project(): Promise<Record<string, JSPrimitive>> {
        this.checkDisposed();
        const result: Record<string, JSPrimitive> = {};

        for await (const [key, val] of this.entries()) {
            result[key] = await val.project();
            await val.dispose();
        }

        return result;
    }

    /**
     * Create a PerlHash from a PerlValue (must be a hash reference).
     *
     * @internal
     */
    static async fromValue(
        value: PerlValue,
        perl: ZeroPerl,
    ): Promise<PerlHash | null> {
        const exports = (value as unknown as { exports: ZeroPerlExports }).exports;
        const hashPtr = await exports.zeroperl_value_to_hash(value.getPtr());
        if (hashPtr === 0) {
            return null;
        }
        return new PerlHash(hashPtr, exports, perl);
    }

    /**
     * Iterate over all key-value pairs.
     */
    async *entries(): AsyncGenerator<[string, PerlValue], void, undefined> {
        this.checkDisposed();
        const iterPtr = await this.exports.zeroperl_hash_iter_new(this.ptr);
        if (iterPtr === 0) {
            throw new ZeroPerlError("Failed to create hash iterator");
        }

        const keyOutPtr = await this.exports.malloc(4);
        const valOutPtr = await this.exports.malloc(4);

        try {
            while (true) {
                const hasNext = await this.exports.zeroperl_hash_iter_next(
                    iterPtr,
                    keyOutPtr,
                    valOutPtr,
                );
                if (!hasNext) {
                    break;
                }

                const view = new DataView(this.exports.memory.buffer);
                const keyPtr = view.getUint32(keyOutPtr, true);
                const valPtr = view.getUint32(valOutPtr, true);

                const key = this.readCString(keyPtr);
                const val = new PerlValue(valPtr, this.exports);

                yield [key, val];
            }
        } finally {
            await this.exports.free(keyOutPtr);
            await this.exports.free(valOutPtr);
            await this.exports.zeroperl_hash_iter_free(iterPtr);
        }
    }

    /**
     * Iterate over all keys.
     */
    async *keys(): AsyncGenerator<string, void, undefined> {
        for await (const [key] of this.entries()) {
            yield key;
        }
    }

    /**
     * Iterate over all values.
     */
    async *values(): AsyncGenerator<PerlValue, void, undefined> {
        for await (const [, val] of this.entries()) {
            yield val;
        }
    }

    /**
     * Free this hash's memory.
     * 
     * After calling dispose(), this hash cannot be used.
     */
    async dispose(): Promise<void> {
        if (this.disposed) return;
        await this.exports.zeroperl_hash_free(this.ptr);
        this.disposed = true;
    }

    private async writeCString(str: string): Promise<number> {
        const bytes = textEncoder.encode(`${str}\0`);
        const ptr = await this.exports.malloc(bytes.length);
        const view = new Uint8Array(this.exports.memory.buffer);
        view.set(bytes, ptr);
        return ptr;
    }

    private readCString(ptr: number): string {
        if (ptr === 0) return "";
        const view = new Uint8Array(this.exports.memory.buffer);
        let len = 0;
        while (view[ptr + len] !== 0) {
            len++;
        }
        return textDecoder.decode(view.subarray(ptr, ptr + len));
    }

    private checkDisposed(): void {
        if (this.disposed) {
            throw new ZeroPerlError("PerlHash has been disposed");
        }
    }
}

/**
 * Perl interpreter for WebAssembly.
 *
 * Main interface to the Perl interpreter. Supports:
 * - Evaluating Perl code and running scripts
 * - Creating and manipulating Perl values, arrays, and hashes
 * - Converting between JavaScript and Perl data structures
 * - Getting and setting Perl variables
 * - Registering JavaScript functions callable from Perl
 * - Calling Perl functions from JavaScript
 *
 * @example
 * ```typescript
 * const perl = await ZeroPerl.create();
 * await perl.eval('print "Hello, World!\n"');
 * await perl.dispose();
 * ```
 *
 * @example
 * ```typescript
 * const perl = await ZeroPerl.create();
 *
 * // Create hash
 * const user = await perl.createHash({
 *   name: 'Alice',
 *   age: 30,
 *   email: 'alice@example.com'
 * });
 *
 * // Create array
 * const scores = await perl.createArray([95, 87, 92, 88]);
 *
 * // Use in Perl
 * await perl.setVariable('user', await user.toValue());
 * await perl.setVariable('scores', await scores.toValue());
 * await perl.eval('print "User: $user->{name}, Age: $user->{age}\n"');
 *
 * await user.dispose();
 * await scores.dispose();
 * await perl.dispose();
 * ```
 *
 * @example
 * ```typescript
 * const perl = await ZeroPerl.create();
 *
 * await perl.registerFunction('process_data', async (data) => {
 *   const jsData = await data.project();
 *   const processed = jsData * 2;
 *   return await perl.toPerlValue(processed);
 * });
 *
 * await perl.eval('print process_data(21), "\n"'); // prints: 42
 * await perl.dispose();
 * ```
 */
export class ZeroPerl {
    private wasi: WASI;
    private isDisposed = false;
    private hostFunctions: Map<number, HostFunction> = new Map();
    private nextFuncId = 1;

    private constructor(wasi: WASI) {
        this.wasi = wasi;
    }

    private get exports(): ZeroPerlExports {
        return this.wasi.exports as unknown as ZeroPerlExports;
    }

    /**
     * Create a new ZeroPerl instance.
     * 
     * @throws {ZeroPerlError} If initialization fails
     */
    static async create(options: ZeroPerlOptions = {}): Promise<ZeroPerl> {
        const source = await loadWasmSource(options.fetch);
        const fileSystem = options.fileSystem || new MemoryFileSystem({ "/": "" });

        const wasiOptions: WASIOptions = {
            env: options.env || {},
            args: ["zeroperl"],
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
        const perl = new ZeroPerl(wasi);

        const hostCallFunction = async (
            funcId: number,
            argc: number,
            argvPtr: number,
        ): Promise<number> => {
            return await perl.handleHostCall(funcId, argc, argvPtr);
        };

        const { instance } = await instantiate(source, {
            wasi_snapshot_preview1: wasi.wasiImport,
            env: {
                call_host_function: hostCallFunction,
            },
        });

        await wasi.initialize(instance);

        const required = [
            "memory",
            "malloc",
            "free",
            "zeroperl_init",
            "zeroperl_eval",
            "zeroperl_run_file",
            "zeroperl_reset",
            "zeroperl_free_interpreter",
            "zeroperl_shutdown",
            "zeroperl_last_error",
            "zeroperl_clear_error",
            "zeroperl_is_initialized",
            "zeroperl_can_evaluate",
            "zeroperl_flush",
        ];

        for (const name of required) {
            if (!(name in perl.exports)) {
                throw new ZeroPerlError(`Missing required export: ${name}`);
            }
        }

        const result = await perl.exports.zeroperl_init();
        if (result !== 0) {
            const error = await perl.getLastError();
            throw new ZeroPerlError(
                "Failed to initialize Perl interpreter",
                result,
                error,
            );
        }

        return perl;
    }

    /** @internal */
    private async handleHostCall(
        funcId: number,
        argc: number,
        argvPtr: number,
    ): Promise<number> {
        const func = this.hostFunctions.get(funcId);
        if (!func) {
            const errorMsg = `Host function ${funcId} not found`;
            const errorPtr = await this.writeCString(errorMsg);
            await this.exports.zeroperl_set_host_error(errorPtr);
            await this.exports.free(errorPtr);
            return 0;
        }

        try {
            const args: PerlValue[] = [];
            if (argc > 0) {
                const view = new DataView(this.exports.memory.buffer);
                for (let i = 0; i < argc; i++) {
                    const valPtr = view.getUint32(argvPtr + i * 4, true);
                    if (valPtr !== 0) {
                        args.push(new PerlValue(valPtr, this.exports));
                    }
                }
            }

            const result = await func(...args);

            if (result instanceof PerlValue) {
                return result.getPtr();
            } else {
                return await this.exports.zeroperl_new_undef();
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorPtr = await this.writeCString(errorMsg);
            await this.exports.zeroperl_set_host_error(errorPtr);
            await this.exports.free(errorPtr);
            return 0;
        }
    }

    /**
     * Create a new integer value.
     * 
     * @throws {ZeroPerlError} If value creation fails
     */
    async createInt(value: number): Promise<PerlValue> {
        this.checkDisposed();
        const ptr = await this.exports.zeroperl_new_int(Math.floor(value));
        if (ptr === 0) {
            throw new ZeroPerlError("Failed to create integer value");
        }
        return new PerlValue(ptr, this.exports);
    }

    /**
     * Create a new unsigned integer value.
     * 
     * @throws {ZeroPerlError} If value creation fails
     */
    async createUInt(value: number): Promise<PerlValue> {
        this.checkDisposed();
        const ptr = await this.exports.zeroperl_new_uint(
            Math.floor(Math.abs(value)),
        );
        if (ptr === 0) {
            throw new ZeroPerlError("Failed to create unsigned integer value");
        }
        return new PerlValue(ptr, this.exports);
    }

    /**
     * Create a new double-precision float value.
     * 
     * @throws {ZeroPerlError} If value creation fails
     */
    async createDouble(value: number): Promise<PerlValue> {
        this.checkDisposed();
        const ptr = await this.exports.zeroperl_new_double(value);
        if (ptr === 0) {
            throw new ZeroPerlError("Failed to create double value");
        }
        return new PerlValue(ptr, this.exports);
    }

    /**
     * Create a new string value.
     * 
     * @throws {ZeroPerlError} If value creation fails
     */
    async createString(value: string): Promise<PerlValue> {
        this.checkDisposed();
        const bytes = textEncoder.encode(value);
        const strPtr = await this.exports.malloc(bytes.length);
        const view = new Uint8Array(this.exports.memory.buffer);
        view.set(bytes, strPtr);

        try {
            const valPtr = await this.exports.zeroperl_new_string(
                strPtr,
                bytes.length,
            );
            if (valPtr === 0) {
                throw new ZeroPerlError("Failed to create string value");
            }
            return new PerlValue(valPtr, this.exports);
        } finally {
            await this.exports.free(strPtr);
        }
    }

    /**
     * Create a new boolean value.
     * 
     * @throws {ZeroPerlError} If value creation fails
     */
    async createBool(value: boolean): Promise<PerlValue> {
        this.checkDisposed();
        const ptr = await this.exports.zeroperl_new_bool(value ? 1 : 0);
        if (ptr === 0) {
            throw new ZeroPerlError("Failed to create boolean value");
        }
        return new PerlValue(ptr, this.exports);
    }

    /**
     * Create a new undefined value.
     * 
     * @throws {ZeroPerlError} If value creation fails
     */
    async createUndef(): Promise<PerlValue> {
        this.checkDisposed();
        const ptr = await this.exports.zeroperl_new_undef();
        if (ptr === 0) {
            throw new ZeroPerlError("Failed to create undef value");
        }
        return new PerlValue(ptr, this.exports);
    }

    /**
     * Create a new Perl array, optionally populated with values.
     *
     * @param values Optional array of JavaScript values to populate the array with
     * @throws {ZeroPerlError} If array creation fails
     * 
     * @example
     * ```typescript
     * const arr = await perl.createArray();
     * await arr.push(1);
     * await arr.push(2);
     * await arr.dispose();
     * ```
     *
     * @example
     * ```typescript
     * const arr = await perl.createArray([1, 2, 3, "hello", true, null]);
     * await perl.setVariable('myarr', await arr.toValue());
     * await perl.eval('print "Length: ", scalar(@$myarr), "\n"');
     * await arr.dispose();
     * ```
     */
    async createArray(values?: PerlConvertible[]): Promise<PerlArray> {
        this.checkDisposed();
        const ptr = await this.exports.zeroperl_new_array();
        if (ptr === 0) {
            throw new ZeroPerlError("Failed to create array");
        }

        const perlArray = new PerlArray(ptr, this.exports, this);

        if (values) {
            for (const item of values) {
                await perlArray.push(item);
            }
        }

        return perlArray;
    }

    /**
     * Create a new Perl hash, optionally populated with values.
     *
     * @param object Optional JavaScript object to populate the hash with
     * @throws {ZeroPerlError} If hash creation fails
     * 
     * @example
     * ```typescript
     * const hash = await perl.createHash();
     * await hash.set('name', 'Alice');
     * await hash.set('age', 30);
     * await hash.dispose();
     * ```
     *
     * @example
     * ```typescript
     * const hash = await perl.createHash({
     *   name: 'Alice',
     *   age: 30,
     *   active: true,
     *   score: 95.5
     * });
     * await perl.setVariable('user', await hash.toValue());
     * await perl.eval('print "User: $user->{name}, Age: $user->{age}\n"');
     * await hash.dispose();
     * ```
     */
    async createHash(object?: Record<string, PerlConvertible>): Promise<PerlHash> {
        this.checkDisposed();
        const ptr = await this.exports.zeroperl_new_hash();
        if (ptr === 0) {
            throw new ZeroPerlError("Failed to create hash");
        }

        const perlHash = new PerlHash(ptr, this.exports, this);

        if (object) {
            for (const [key, value] of Object.entries(object)) {
                await perlHash.set(key, value);
            }
        }

        return perlHash;
    }

    /**
     * Convert a JavaScript value to a PerlValue.
     *
     * Conversion rules:
     * - PerlValue → returned as-is
     * - null/undefined → undef
     * - boolean → Perl boolean
     * - integer → Perl int
     * - float → Perl double
     * - string → Perl string
     * - array → Perl array reference
     * - object → Perl hash reference
     * 
     * @throws {ZeroPerlError} If conversion fails
     */
    async toPerlValue(value: PerlConvertible): Promise<PerlValue> {
        if (value instanceof PerlValue) {
            return value;
        }

        if (value === null || value === undefined) {
            return await this.createUndef();
        }

        if (typeof value === 'boolean') {
            return await this.createBool(value);
        }

        if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                return await this.createInt(value);
            } else {
                return await this.createDouble(value);
            }
        }

        if (typeof value === 'string') {
            return await this.createString(value);
        }

        if (Array.isArray(value)) {
            const arr = await this.createArray(value);
            const val = await arr.toValue();
            await arr.dispose();
            return val;
        }

        if (typeof value === 'object') {
            const hash = await this.createHash(value);
            const val = await hash.toValue();
            await hash.dispose();
            return val;
        }

        throw new ZeroPerlError(`Cannot convert value of type ${typeof value} to PerlValue`);
    }

    /**
     * Get a global scalar variable.
     * 
     * @returns The variable's value, or null if variable doesn't exist
     */
    async getVariable(name: string): Promise<PerlValue | null> {
        this.checkDisposed();
        const namePtr = await this.writeCString(name);
        try {
            const valPtr = await this.exports.zeroperl_get_var(namePtr);
            if (valPtr === 0) {
                return null;
            }
            return new PerlValue(valPtr, this.exports);
        } finally {
            await this.exports.free(namePtr);
        }
    }

    /**
     * Get a global array variable.
     * 
     * @returns The array, or null if variable doesn't exist
     */
    async getArrayVariable(name: string): Promise<PerlArray | null> {
        this.checkDisposed();
        const namePtr = await this.writeCString(name);
        try {
            const arrPtr = await this.exports.zeroperl_get_array_var(namePtr);
            if (arrPtr === 0) {
                return null;
            }
            return new PerlArray(arrPtr, this.exports, this);
        } finally {
            await this.exports.free(namePtr);
        }
    }

    /**
     * Get a global hash variable.
     * 
     * @returns The hash, or null if variable doesn't exist
     */
    async getHashVariable(name: string): Promise<PerlHash | null> {
        this.checkDisposed();
        const namePtr = await this.writeCString(name);
        try {
            const hashPtr = await this.exports.zeroperl_get_hash_var(namePtr);
            if (hashPtr === 0) {
                return null;
            }
            return new PerlHash(hashPtr, this.exports, this);
        } finally {
            await this.exports.free(namePtr);
        }
    }

    /**
     * Set a global scalar variable.
     * 
     * @throws {ZeroPerlError} If setting the variable fails
     */
    async setVariable(name: string, value: PerlConvertible): Promise<void> {
        this.checkDisposed();
        const perlValue = await this.toPerlValue(value);
        const namePtr = await this.writeCString(name);
        try {
            const success =
                (await this.exports.zeroperl_set_var(namePtr, perlValue.getPtr())) !==
                0;
            if (!success) {
                throw new ZeroPerlError(`Failed to set variable '${name}'`);
            }
        } finally {
            await this.exports.free(namePtr);
            if (!(value instanceof PerlValue)) {
                await perlValue.dispose();
            }
        }
    }

    /**
     * Register a JavaScript function that can be called from Perl.
     * 
     * The function receives Perl values as arguments and returns a Perl value or void.
     * 
     * @example
     * ```typescript
     * await perl.registerFunction('add', async (a, b) => {
     *   const x = await a.toInt();
     *   const y = await b.toInt();
     *   return await perl.createInt(x + y);
     * });
     * await perl.eval('print add(10, 32), "\n"'); // prints: 42
     * ```
     */
    async registerFunction(name: string, fn: HostFunction): Promise<void> {
        this.checkDisposed();
        const funcId = this.nextFuncId++;
        this.hostFunctions.set(funcId, fn);

        const namePtr = await this.writeCString(name);
        try {
            await this.exports.zeroperl_register_function(funcId, namePtr);
        } finally {
            await this.exports.free(namePtr);
        }
    }

    /**
     * Register a JavaScript method that can be called from Perl.
     * 
     * The method receives Perl values as arguments and returns a Perl value or void.
     * 
     * @example
     * ```typescript
     * await perl.registerMethod('Math', 'square', async (x) => {
     *   const num = await x.toInt();
     *   return await perl.createInt(num * num);
     * });
     * await perl.eval('$result = Math::square(7)'); // $result = 49
     * ```
     */
    async registerMethod(
        packageName: string,
        methodName: string,
        fn: HostFunction,
    ): Promise<void> {
        this.checkDisposed();
        const funcId = this.nextFuncId++;
        this.hostFunctions.set(funcId, fn);

        const pkgPtr = await this.writeCString(packageName);
        const methPtr = await this.writeCString(methodName);
        try {
            await this.exports.zeroperl_register_method(funcId, pkgPtr, methPtr);
        } finally {
            await this.exports.free(pkgPtr);
            await this.exports.free(methPtr);
        }
    }

    /**
     * Call a Perl subroutine in void context (no return value).
     */
    call(
        name: string,
        args: PerlValue[],
        context: "void",
    ): Promise<undefined>;

    /**
     * Call a Perl subroutine in scalar context (returns single value or null).
     */
    call(
        name: string,
        args: PerlValue[],
        context: "scalar",
    ): Promise<PerlValue | null>;

    /**
     * Call a Perl subroutine in list context (returns array of values).
     */
    call(
        name: string,
        args: PerlValue[],
        context: "list",
    ): Promise<PerlValue[]>;

    /**
     * Call a Perl subroutine (defaults to scalar context).
     */
    call(
        name: string,
        args?: PerlValue[],
        context?: PerlContext,
    ): Promise<PerlValue | null>;

    async call(
        name: string,
        args: PerlValue[] = [],
        context: PerlContext = "scalar",
    ): Promise<undefined | PerlValue | null | PerlValue[]> {
        this.checkDisposed();

        const namePtr = await this.writeCString(name);
        const contextNum = mapContext(context);

        let argvPtr = 0;

        if (args.length > 0) {
            argvPtr = await this.exports.malloc(args.length * 4);
            const view = new DataView(this.exports.memory.buffer);
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                if (!arg) {
                    throw new ZeroPerlError(`Argument at index ${i} is undefined`);
                }
                const ptr = arg.getPtr();
                view.setUint32(argvPtr + i * 4, ptr, true);
            }
        }

        try {
            const resultPtr = await this.exports.zeroperl_call(
                namePtr,
                contextNum,
                args.length,
                argvPtr,
            );

            if (resultPtr === 0) {
                if (context === "void") return;
                if (context === "scalar") return null;
                return [];
            }

            const view = new DataView(this.exports.memory.buffer);
            const count = view.getInt32(resultPtr, true);

            const results: PerlValue[] = [];
            for (let i = 0; i < count; i++) {
                const valPtr = await this.exports.zeroperl_result_get(resultPtr, i);
                if (valPtr !== 0) {
                    results.push(new PerlValue(valPtr, this.exports));
                }
            }

            const valuesArrayPtr = view.getUint32(resultPtr + 4, true);
            if (valuesArrayPtr !== 0) {
                await this.exports.free(valuesArrayPtr);
            }

            await this.exports.free(resultPtr);

            if (context === "void") {
                for (const val of results) {
                    await val.dispose();
                }
                return;
            }

            if (context === "scalar") {
                return results[0] ?? null;
            }
            return results;

        } catch (e) {
            if (e instanceof WASIProcExit) {
                if (context === "void") return;
                if (context === "scalar") return null;
                return [];
            }
            throw e;
        } finally {
            await this.exports.free(namePtr);
            if (argvPtr !== 0) {
                await this.exports.free(argvPtr);
            }
        }
    }

    /**
     * Evaluate a string of Perl code.
     * 
     * @param code Perl code to evaluate
     * @param args Arguments to pass as @ARGV
     * @returns Result indicating success or failure
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
            const exitCode = await this.exports.zeroperl_eval(
                codePtr,
                mapContext("scalar"),
                args.length,
                argv,
            );

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
     * Run a Perl script file.
     * 
     * @param scriptPath Path to the script file
     * @param args Arguments to pass as @ARGV
     * @returns Result indicating success or failure
     */
    async runFile(
        scriptPath: string,
        args: string[] = [],
    ): Promise<ZeroPerlResult> {
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
            const exitCode = await this.exports.zeroperl_run_file(
                pathPtr,
                args.length,
                argv,
            );

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
     * Reset the interpreter to a clean state.
     * 
     * Clears all variables and errors. Registered host functions remain.
     * 
     * @throws {ZeroPerlError} If reset fails
     */
    async reset(): Promise<void> {
        this.checkDisposed();

        const result = await this.exports.zeroperl_reset();
        if (result !== 0) {
            const error = await this.getLastError();
            throw new ZeroPerlError(
                "Failed to reset Perl interpreter",
                result,
                error,
            );
        }
    }

    /**
     * Flush STDOUT and STDERR buffers.
     * 
     * @throws {ZeroPerlError} If flush fails
     */
    async flush(): Promise<void> {
        this.checkDisposed();

        const result = await this.exports.zeroperl_flush();
        if (result !== 0) {
            throw new ZeroPerlError("Failed to flush output buffers", result);
        }
    }

    /**
     * Get the last error message from Perl ($@).
     */
    async getLastError(): Promise<string> {
        this.checkDisposed();

        const errorPtr = await this.exports.zeroperl_last_error();
        return this.readCString(errorPtr);
    }

    /**
     * Clear the error state ($@).
     */
    async clearError(): Promise<void> {
        this.checkDisposed();
        await this.exports.zeroperl_clear_error();
    }

    /**
     * Check if the interpreter is initialized.
     */
    async isInitialized(): Promise<boolean> {
        this.checkDisposed();
        const result = await this.exports.zeroperl_is_initialized();
        return result !== 0;
    }

    /**
     * Check if the interpreter is ready to evaluate code.
     */
    async canEvaluate(): Promise<boolean> {
        this.checkDisposed();
        const result = await this.exports.zeroperl_can_evaluate();
        return result !== 0;
    }

    /**
     * Free the Perl interpreter's memory.
     * 
     * After calling dispose(), this instance cannot be used.
     */
    async dispose(): Promise<void> {
        if (this.isDisposed) return;

        await this.exports.zeroperl_free_interpreter();
        this.isDisposed = true;
        this.hostFunctions.clear();
    }

    /**
     * Shut down the Perl system.
     * 
     * After calling shutdown(), this instance cannot be used.
     */
    async shutdown(): Promise<void> {
        if (this.isDisposed) return;

        await this.exports.zeroperl_shutdown();
        this.isDisposed = true;
        this.hostFunctions.clear();
    }

    private async writeCString(str: string): Promise<number> {
        const bytes = textEncoder.encode(`${str}\0`);
        const ptr = await this.exports.malloc(bytes.length);
        const view = new Uint8Array(this.exports.memory.buffer);
        view.set(bytes, ptr);
        return ptr;
    }

    private readCString(ptr: number): string {
        if (ptr === 0) return "";

        const view = new Uint8Array(this.exports.memory.buffer);
        let len = 0;
        while (view[ptr + len] !== 0) {
            len++;
        }

        return textDecoder.decode(view.subarray(ptr, ptr + len));
    }

    private async writeStringArray(
        args: string[],
    ): Promise<{ argv: number; buffers: number[] }> {
        const buffers: number[] = [];

        const argv = await this.exports.malloc(args.length * 4);
        const argvView = new DataView(this.exports.memory.buffer);

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === undefined) {
                throw new ZeroPerlError(`Argument at index ${i} is undefined`);
            }
            const strPtr = await this.writeCString(arg);
            buffers.push(strPtr);
            argvView.setUint32(argv + i * 4, strPtr, true);
        }

        return { argv, buffers };
    }

    private async freeStringArray(
        argv: number,
        buffers: number[],
    ): Promise<void> {
        for (const buf of buffers) {
            await this.exports.free(buf);
        }
        await this.exports.free(argv);
    }

    private checkDisposed(): void {
        if (this.isDisposed) {
            throw new ZeroPerlError("ZeroPerl instance has been disposed");
        }
    }
}