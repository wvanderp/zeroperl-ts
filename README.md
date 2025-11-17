# zeroperl-ts

Perl 5 compiled to WebAssembly. Run Perl scripts in the browser or other JavaScript environments without installing Perl.

Powered by [zeroperl](https://github.com/6over3/zeroperl)

## Installation

```bash
npm install @6over3/zeroperl-ts
# or
bun add @6over3/zeroperl-ts
```

Or, for [Browser Usage](#browser-usage), copy the zeroperl WASM binary to your local website (to avoid CORS errors).

```bash
# The -L option allows the CDN to redirect to the latest version
curl -L -O https://esm.sh/@6over3/zeroperl-ts/zeroperl.wasm
```

## Quick Start

```typescript
import { ZeroPerl } from '@6over3/zeroperl-ts';

const perl = await ZeroPerl.create();
await perl.eval('print "Hello, World!\\n"');
await perl.flush(); // You need this to see the output!
await perl.dispose();
```

## Important: Output Buffering

By default, Perl buffers output. You have two options:

**Option 1: Call `flush()` after printing**
```typescript
await perl.eval('print "Hello!\\n"');
await perl.flush(); // Now you'll see it
```

**Option 2: Enable autoflush in your Perl code**
```typescript
await perl.eval(`
  $| = 1;  # Enable autoflush
  print "Hello!\\n";  # This will show immediately
`);
```

## Basic Usage

### Evaluating Perl Code

```typescript
import { ZeroPerl } from '@6over3/zeroperl-ts';

const perl = await ZeroPerl.create();

const result = await perl.eval(`
  $| = 1;  # Enable autoflush
  my $x = 42;
  print "The answer is $x\\n";
`);

if (!result.success) {
  console.error('Error:', result.error);
}

await perl.dispose();
```

### Capturing Output

```typescript
let output = '';

const perl = await ZeroPerl.create({
  stdout: (data) => {
    output += typeof data === 'string' ? data : new TextDecoder().decode(data);
  }
});

await perl.eval(`
  $| = 1;
  print "Line 1\\n";
  print "Line 2\\n";
`);

console.log(output);
// Output:
// Line 1
// Line 2

await perl.dispose();
```

### Passing Data Between JavaScript and Perl

```typescript
const perl = await ZeroPerl.create();

// JavaScript → Perl
await perl.setVariable('name', 'Alice');
await perl.setVariable('age', '30');

await perl.eval(`
  $| = 1;
  print "Name: $name\\n";
  print "Age: $age\\n";
`);

// Perl → JavaScript
await perl.eval('$result = 2 + 2');
const result = await perl.getVariable('result');
console.log(result); // "4"

await perl.dispose();
```

### Using Command-Line Arguments

```typescript
const perl = await ZeroPerl.create();

await perl.eval(`
  $| = 1;
  print "Arguments: @ARGV\\n";
  foreach my $arg (@ARGV) {
    print "  $arg\\n";
  }
`, ['foo', 'bar', 'baz']);

await perl.dispose();
```

## Working with Files

### Creating a Virtual Filesystem

```typescript
import { ZeroPerl, MemoryFileSystem } from '@6over3/zeroperl-ts';

// Create filesystem
const fs = new MemoryFileSystem({ "/": "" });

// Add files
fs.addFile("/data.txt", "Hello from a file!");
fs.addFile("/script.pl", `
  $| = 1;
  open my $fh, '<', '/data.txt' or die $!;
  while (my $line = <$fh>) {
    print "Read: $line";
  }
  close $fh;
`);

// Create Perl instance with the filesystem
const perl = await ZeroPerl.create({ fileSystem: fs });

await perl.runFile('/script.pl');

await perl.dispose();
```

### Running Scripts with Arguments

```typescript
const fs = new MemoryFileSystem({ "/": "" });
fs.addFile("/greet.pl", `
  $| = 1;
  my ($name, $greeting) = @ARGV;
  print "$greeting, $name!\\n";
`);

const perl = await ZeroPerl.create({ fileSystem: fs });

await perl.runFile('/greet.pl', ['Alice', 'Hello']);
// Output: Hello, Alice!

await perl.dispose();
```

### Reading and Writing Files

```typescript
const fs = new MemoryFileSystem({ "/": "" });

const perl = await ZeroPerl.create({ fileSystem: fs });

// Write a file from Perl
await perl.eval(`
  $| = 1;
  open my $fh, '>', '/output.txt' or die $!;
  print $fh "Generated content\\n";
  close $fh;
  print "File written!\\n";
`);

// Read it back from JavaScript
const content = fs.readFile('/output.txt');
console.log(content); // "Generated content\n"

await perl.dispose();
```

## Advanced Usage

### Error Handling

```typescript
const perl = await ZeroPerl.create();

const result = await perl.eval(`
  die "Something went wrong!";
`);

if (!result.success) {
  console.log('Exit code:', result.exitCode);
  console.log('Error:', result.error);
}

// Or get error directly
const error = await perl.getLastError();
console.log(error); // "Something went wrong! at ..."

await perl.dispose();
```

### Environment Variables

```typescript
const perl = await ZeroPerl.create({
  env: {
    API_KEY: 'secret123',
    DEBUG: 'true'
  }
});

await perl.eval(`
  $| = 1;
  print "API Key: $ENV{API_KEY}\\n";
  print "Debug: $ENV{DEBUG}\\n";
`);

await perl.dispose();
```

### Resetting State

```typescript
const perl = await ZeroPerl.create();

await perl.eval('$counter = 1');
console.log(await perl.getVariable('counter')); // "1"

await perl.reset(); // Clean slate

console.log(await perl.getVariable('counter')); // null

await perl.dispose();
```

### Progressive Output (with Manual Flushing)

```typescript
const perl = await ZeroPerl.create({
  stdout: (data) => process.stdout.write(data)
});

for (let i = 0; i < 5; i++) {
  await perl.eval('print "."');
  await perl.flush(); // Force output immediately
  await new Promise(r => setTimeout(r, 500));
}

await perl.dispose();
```

## Browser Usage

```html
<!DOCTYPE html>
<html>
<body>
  <div id="output"></div>
  
  <script type="module">
    import { ZeroPerl } from 'https://esm.sh/@6over3/zeroperl-ts';
    
    const output = document.getElementById('output');
    
    const perl = await ZeroPerl.create({
      stdout: (data) => {
        const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
        output.innerHTML += text.replace(/\n/g, '<br>');
      }
    });
    
    await perl.eval(`
      $| = 1;  # Don't forget autoflush!
      print "Hello from Perl!\\n";
      print "Running in: $^O\\n";
    `);
    
    await perl.dispose();
  </script>
</body>
</html>
```

## API Reference

### `ZeroPerl.create(options?)`

Creates a new Perl interpreter instance.

```typescript
const perl = await ZeroPerl.create({
  env: { KEY: 'value' },           // Environment variables
  fileSystem: fs,                   // Virtual filesystem
  stdout: (data) => { },           // Capture stdout
  stderr: (data) => { },           // Capture stderr
  fetch: customFetch                // Custom fetch for WASM loading
});
```

### `perl.eval(code, args?)`

Evaluate Perl code. Remember to flush or enable autoflush!

```typescript
const result = await perl.eval('print "Hello\\n"', ['arg1', 'arg2']);
// result: { success: boolean, error?: string, exitCode: number }
```

### `perl.runFile(path, args?)`

Run a Perl script from the virtual filesystem.

```typescript
await perl.runFile('/script.pl', ['arg1', 'arg2']);
```

### `perl.setVariable(name, value)` / `perl.getVariable(name)`

Exchange scalar variables between JavaScript and Perl.

```typescript
await perl.setVariable('x', '42');  // Don't include the $
const x = await perl.getVariable('x');
```

### `perl.flush()`

Force output buffers to flush. Critical if you haven't set `$| = 1`.

```typescript
await perl.eval('print "text"');
await perl.flush();  // Now you'll see it
```

### `perl.reset()`

Reset interpreter to clean state. Clears all variables and state.

```typescript
await perl.reset();
```

### `perl.dispose()` / `perl.shutdown()`

Clean up resources. Use `dispose()` for normal cleanup, `shutdown()` for complete termination.

```typescript
await perl.dispose();  // Normal cleanup
// or
await perl.shutdown(); // Complete shutdown
```

## Common Patterns

### Run a Perl script that processes JSON

```typescript
import { ZeroPerl, MemoryFileSystem } from '@6over3/zeroperl-ts';

const fs = new MemoryFileSystem({ "/": "" });
fs.addFile("/data.json", JSON.stringify({ users: ['Alice', 'Bob'] }));
fs.addFile("/process.pl", `
  $| = 1;
  use strict;
  use warnings;
  
  # Read JSON file
  open my $fh, '<', '/data.json' or die $!;
  my $json = do { local $/; <$fh> };
  close $fh;
  
  # Simple parsing (real code would use JSON module)
  print "Processing: $json\\n";
`);

const perl = await ZeroPerl.create({ fileSystem: fs });
await perl.runFile('/process.pl');
await perl.dispose();
```

### Interactive REPL-style usage

```typescript
const perl = await ZeroPerl.create({
  stdout: (data) => console.log(data)
});

await perl.eval('$| = 1');  // Enable autoflush once

// Now run commands interactively
await perl.eval('$x = 10');
await perl.eval('print "$x\\n"');
await perl.eval('$x *= 2');
await perl.eval('print "$x\\n"');

await perl.dispose();
```

## Development

```bash
npm i    # Install dependencies
bun run build  # Build ESM and CJS distributions
bun test       # Run tests
```

## License

Apache-2.0

## About

ZeroPerl brings Perl 5 to WebAssembly using a WASI-compliant implementation. This wrapper provides a convenient TypeScript/JavaScript API on top of the core [ZeroPerl](https://github.com/6over3/zeroperl) WASM module.