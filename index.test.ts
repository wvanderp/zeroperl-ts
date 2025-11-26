import { describe, expect, it } from "bun:test";
import { MemoryFileSystem, ZeroPerl } from "./index";

describe("Basic Operations", () => {
	it("should create and dispose ZeroPerl instance", async () => {
		const perl = await ZeroPerl.create();
		expect(await perl.isInitialized()).toBe(true);
		expect(await perl.canEvaluate()).toBe(true);
		await perl.dispose();
	});

	it("should evaluate basic Perl code", async () => {
		const perl = await ZeroPerl.create();
		const result = await perl.eval("$x = 42");
		expect(result.success).toBe(true);
		expect(result.exitCode).toBe(0);
		await perl.dispose();
	});

	it("should handle errors gracefully", async () => {
		const perl = await ZeroPerl.create();
		const result = await perl.eval('die "test error"');
		expect(result.success).toBe(false);
		expect(result.error).toContain("test error");
		await perl.dispose();
	});

	it("should get and clear last error", async () => {
		const perl = await ZeroPerl.create();
		await perl.eval('die "custom error"');

		const error = await perl.getLastError();
		expect(error).toContain("custom error");

		await perl.clearError();
		const clearedError = await perl.getLastError();
		expect(clearedError).toBe("");

		await perl.dispose();
	});

	it("should reset to clean state", async () => {
		const perl = await ZeroPerl.create();

		await perl.setVariable("x", 42);
		let value = await perl.getVariable("x");
		expect(await value?.toInt()).toBe(42);

		await perl.reset();

		value = await perl.getVariable("x");
		expect(value).toBeNull();

		await perl.dispose();
	});

	it("should flush output buffers", async () => {
		let output = "";
		const perl = await ZeroPerl.create({
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.eval('print "test"');
		expect(output).toBe("");

		await perl.flush();
		expect(output).toBe("test");

		await perl.dispose();
	});

	it("should shutdown completely", async () => {
		const perl = await ZeroPerl.create();
		await perl.eval("$x = 42");
		await perl.shutdown();

		await expect(async () => {
			await perl.eval("$y = 10");
		}).toThrow();
	});

	it("should throw error when using disposed instance", async () => {
		const perl = await ZeroPerl.create();
		await perl.dispose();

		await expect(async () => {
			await perl.eval("$x = 1");
		}).toThrow("ZeroPerl instance has been disposed");
	});
});

describe("Value Creation", () => {
	it("should create integer values", async () => {
		const perl = await ZeroPerl.create();
		const val = await perl.createInt(42);

		expect(await val.getType()).toBe("int");
		expect(await val.toInt()).toBe(42);
		expect(await val.project()).toBe(42);

		await val.dispose();
		await perl.dispose();
	});

	it("should create unsigned integer values", async () => {
		const perl = await ZeroPerl.create();
		const val = await perl.createUInt(100);

		expect(await val.toInt()).toBe(100);

		await val.dispose();
		await perl.dispose();
	});

	it("should create double values", async () => {
		const perl = await ZeroPerl.create();
		const val = await perl.createDouble(Math.PI);

		expect(await val.getType()).toBe("double");
		const result = await val.toDouble();
		expect(Math.abs(result - Math.PI)).toBeLessThan(0.0001);

		await val.dispose();
		await perl.dispose();
	});

	it("should create string values", async () => {
		const perl = await ZeroPerl.create();
		const val = await perl.createString("hello world");

		expect(await val.getType()).toBe("string");
		expect(await val.toString()).toBe("hello world");
		expect(await val.project()).toBe("hello world");

		await val.dispose();
		await perl.dispose();
	});

	it("should create boolean values", async () => {
		const perl = await ZeroPerl.create();
		const valTrue = await perl.createBool(true);
		const valFalse = await perl.createBool(false);

		expect(await valTrue.toBoolean()).toBe(true);
		expect(await valFalse.toBoolean()).toBe(false);
		expect(await valTrue.project()).toBe(true);
		expect(await valFalse.project()).toBe(false);

		await valTrue.dispose();
		await valFalse.dispose();
		await perl.dispose();
	});

	it("should create undef values", async () => {
		const perl = await ZeroPerl.create();
		const val = await perl.createUndef();

		expect(await val.isUndef()).toBe(true);
		expect(await val.project()).toBeNull();

		await val.dispose();
		await perl.dispose();
	});

	it("should convert JavaScript primitives to Perl", async () => {
		const perl = await ZeroPerl.create();

		const num = await perl.toPerlValue(42);
		expect(await num.toInt()).toBe(42);

		const str = await perl.toPerlValue("test");
		expect(await str.toString()).toBe("test");

		const bool = await perl.toPerlValue(true);
		expect(await bool.toBoolean()).toBe(true);

		const undef = await perl.toPerlValue(null);
		expect(await undef.isUndef()).toBe(true);

		await num.dispose();
		await str.dispose();
		await bool.dispose();
		await undef.dispose();
		await perl.dispose();
	});

	it("should convert JavaScript arrays to Perl", async () => {
		const perl = await ZeroPerl.create();

		const arrVal = await perl.toPerlValue([1, 2, 3]);
		expect(await arrVal.isRef()).toBe(true);

		await arrVal.dispose();
		await perl.dispose();
	});

	it("should convert JavaScript objects to Perl", async () => {
		const perl = await ZeroPerl.create();

		const objVal = await perl.toPerlValue({ a: 1, b: 2 });
		expect(await objVal.isRef()).toBe(true);

		await objVal.dispose();
		await perl.dispose();
	});

	it("should convert nested JavaScript structures to Perl", async () => {
		const perl = await ZeroPerl.create();

		const nested = await perl.toPerlValue({
			name: "Alice",
			scores: [95, 87, 92],
			metadata: {
				age: 30,
				active: true,
			},
		});

		expect(await nested.isRef()).toBe(true);

		await nested.dispose();
		await perl.dispose();
	});
});

describe("PerlValue Operations", () => {
	it("should convert values to different types", async () => {
		const perl = await ZeroPerl.create();
		const val = await perl.createInt(42);

		expect(await val.toInt()).toBe(42);
		expect(await val.toDouble()).toBe(42.0);
		expect(await val.toString()).toBe("42");
		expect(await val.toBoolean()).toBe(true);

		await val.dispose();
		await perl.dispose();
	});

	it("should check value types", async () => {
		const perl = await ZeroPerl.create();

		const intVal = await perl.createInt(42);
		expect(await intVal.getType()).toBe("int");

		const strVal = await perl.createString("hello");
		expect(await strVal.getType()).toBe("string");

		const undefVal = await perl.createUndef();
		expect(await undefVal.isUndef()).toBe(true);

		await intVal.dispose();
		await strVal.dispose();
		await undefVal.dispose();
		await perl.dispose();
	});

	it("should create and dereference references", async () => {
		const perl = await ZeroPerl.create();
		const val = await perl.createInt(42);

		const ref = await val.createRef();
		expect(await ref.isRef()).toBe(true);

		const deref = await ref.deref();
		expect(await deref.toInt()).toBe(42);

		await val.dispose();
		await ref.dispose();
		await deref.dispose();
		await perl.dispose();
	});

	it("should handle reference counting", async () => {
		const perl = await ZeroPerl.create();
		const val = await perl.createInt(42);

		await val.incref();
		await val.decref();

		expect(await val.toInt()).toBe(42);

		await val.dispose();
		await perl.dispose();
	});

	it("should convert to JavaScript primitives via project()", async () => {
		const perl = await ZeroPerl.create();

		const num = await perl.createInt(42);
		expect(await num.project()).toBe(42);

		const str = await perl.createString("hello");
		expect(await str.project()).toBe("hello");

		const undef = await perl.createUndef();
		expect(await undef.project()).toBeNull();

		const boolTrue = await perl.createBool(true);
		expect(await boolTrue.project()).toBe(true);

		const boolFalse = await perl.createBool(false);
		expect(await boolFalse.project()).toBe(false);

		await num.dispose();
		await str.dispose();
		await undef.dispose();
		await boolTrue.dispose();
		await boolFalse.dispose();
		await perl.dispose();
	});

	it("should throw error when using disposed PerlValue", async () => {
		const perl = await ZeroPerl.create();
		const val = await perl.createInt(42);
		await val.dispose();

		await expect(async () => {
			await val.toInt();
		}).toThrow("PerlValue has been disposed");

		await perl.dispose();
	});
});

describe("Arrays", () => {
	it("should create empty arrays", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray();

		expect(await arr.getLength()).toBe(0);

		await arr.dispose();
		await perl.dispose();
	});

	it("should create arrays from JavaScript arrays", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray([1, 2, 3, "hello", true, null]);

		expect(await arr.getLength()).toBe(6);

		const val0 = await arr.get(0);
		expect(await val0?.toInt()).toBe(1);

		const val3 = await arr.get(3);
		expect(await val3?.toString()).toBe("hello");

		const val4 = await arr.get(4);
		expect(await val4?.toBoolean()).toBe(true);

		const val5 = await arr.get(5);
		expect(await val5?.isUndef()).toBe(true);

		await val0?.dispose();
		await val3?.dispose();
		await val4?.dispose();
		await val5?.dispose();
		await arr.dispose();
		await perl.dispose();
	});

	it("should push and pop values", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray();

		await arr.push(42);
		await arr.push("hello");
		await arr.push(true);

		expect(await arr.getLength()).toBe(3);

		const val = await arr.pop();
		expect(await val?.toBoolean()).toBe(true);

		expect(await arr.getLength()).toBe(2);

		await val?.dispose();
		await arr.dispose();
		await perl.dispose();
	});

	it("should get and set values by index", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray();

		await arr.push(1);
		await arr.push(2);
		await arr.push(3);

		const val = await arr.get(1);
		expect(await val?.toInt()).toBe(2);

		await arr.set(1, 99);
		const newVal = await arr.get(1);
		expect(await newVal?.toInt()).toBe(99);

		await val?.dispose();
		await newVal?.dispose();
		await arr.dispose();
		await perl.dispose();
	});

	it("should clear arrays", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray();

		await arr.push(1);
		await arr.push(2);
		await arr.push(3);

		expect(await arr.getLength()).toBe(3);

		await arr.clear();
		expect(await arr.getLength()).toBe(0);

		await arr.dispose();
		await perl.dispose();
	});

	it("should iterate over array values", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray();

		await arr.push(1);
		await arr.push(2);
		await arr.push(3);

		const values: number[] = [];
		for await (const val of arr) {
			values.push(await val.toInt());
			await val.dispose();
		}

		expect(values).toEqual([1, 2, 3]);

		await arr.dispose();
		await perl.dispose();
	});

	it("should convert array to PerlValue", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray();

		await arr.push(1);
		await arr.push(2);

		const val = await arr.toValue();
		expect(await val.isRef()).toBe(true);

		await val.dispose();
		await arr.dispose();
		await perl.dispose();
	});

	it("should convert array to JavaScript array via project()", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray();

		await arr.push(42);
		await arr.push("hello");
		await arr.push(true);

		const jsArr = await arr.project();
		expect(jsArr).toEqual([42, "hello", true]);

		await arr.dispose();
		await perl.dispose();
	});

	it("should round-trip JavaScript arrays", async () => {
		const perl = await ZeroPerl.create();
		const original = [1, 2, 3, "test", true, null];

		const arr = await perl.createArray(original);
		const result = await arr.project();

		expect(result).toEqual(original);

		await arr.dispose();
		await perl.dispose();
	});

	it("should handle nested arrays", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray([1, [2, 3], [4, [5, 6]]]);

		expect(await arr.getLength()).toBe(3);

		const val0 = await arr.get(0);
		expect(await val0?.toInt()).toBe(1);

		const val1 = await arr.get(1);
		expect(await val1?.isRef()).toBe(true);

		await val0?.dispose();
		await val1?.dispose();
		await arr.dispose();
		await perl.dispose();
	});

	it("should throw error when using disposed PerlArray", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray();
		await arr.dispose();

		await expect(async () => {
			await arr.getLength();
		}).toThrow("PerlArray has been disposed");

		await perl.dispose();
	});
});

describe("Hashes", () => {
	it("should create empty hashes", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();

		expect(await hash.has("key")).toBe(false);

		await hash.dispose();
		await perl.dispose();
	});

	it("should create hashes from JavaScript objects", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash({
			name: "Alice",
			age: 30,
			active: true,
			score: 95.5,
		});

		const name = await hash.get("name");
		expect(await name?.toString()).toBe("Alice");

		const age = await hash.get("age");
		expect(await age?.toInt()).toBe(30);

		const active = await hash.get("active");
		expect(await active?.toBoolean()).toBe(true);

		await name?.dispose();
		await age?.dispose();
		await active?.dispose();
		await hash.dispose();
		await perl.dispose();
	});

	it("should set and get values", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();

		await hash.set("name", "Alice");
		await hash.set("age", 30);

		const name = await hash.get("name");
		expect(await name?.toString()).toBe("Alice");

		const age = await hash.get("age");
		expect(await age?.toInt()).toBe(30);

		await name?.dispose();
		await age?.dispose();
		await hash.dispose();
		await perl.dispose();
	});

	it("should check if keys exist", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();

		await hash.set("key1", "value1");

		expect(await hash.has("key1")).toBe(true);
		expect(await hash.has("key2")).toBe(false);

		await hash.dispose();
		await perl.dispose();
	});

	it("should delete keys", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();

		await hash.set("key", "value");
		expect(await hash.has("key")).toBe(true);

		const deleted = await hash.delete("key");
		expect(deleted).toBe(true);
		expect(await hash.has("key")).toBe(false);

		const notDeleted = await hash.delete("nonexistent");
		expect(notDeleted).toBe(false);

		await hash.dispose();
		await perl.dispose();
	});

	it("should clear hashes", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();

		await hash.set("key1", "value1");
		await hash.set("key2", "value2");

		await hash.clear();

		expect(await hash.has("key1")).toBe(false);
		expect(await hash.has("key2")).toBe(false);

		await hash.dispose();
		await perl.dispose();
	});

	it("should iterate over entries", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();

		await hash.set("a", 1);
		await hash.set("b", 2);
		await hash.set("c", 3);

		const entries: Record<string, number> = {};
		for await (const [key, val] of hash.entries()) {
			entries[key] = await val.toInt();
			await val.dispose();
		}

		expect(entries).toEqual({ a: 1, b: 2, c: 3 });

		await hash.dispose();
		await perl.dispose();
	});

	it("should iterate over keys", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();

		await hash.set("key1", "value1");
		await hash.set("key2", "value2");

		const keys: string[] = [];
		for await (const key of hash.keys()) {
			keys.push(key);
		}

		expect(keys.sort()).toEqual(["key1", "key2"]);

		await hash.dispose();
		await perl.dispose();
	});

	it("should iterate over values", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();

		await hash.set("a", 1);
		await hash.set("b", 2);

		const values: number[] = [];
		for await (const val of hash.values()) {
			values.push(await val.toInt());
			await val.dispose();
		}

		expect(values.sort()).toEqual([1, 2]);

		await hash.dispose();
		await perl.dispose();
	});

	it("should convert hash to PerlValue", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();

		await hash.set("key", "value");

		const val = await hash.toValue();
		expect(await val.isRef()).toBe(true);

		await val.dispose();
		await hash.dispose();
		await perl.dispose();
	});

	it("should convert hash to JavaScript object via project()", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();

		await hash.set("name", "Bob");
		await hash.set("age", 25);
		await hash.set("active", true);

		const obj = await hash.project();
		expect(obj).toEqual({
			name: "Bob",
			age: 25,
			active: true,
		});

		await hash.dispose();
		await perl.dispose();
	});

	it("should round-trip JavaScript objects", async () => {
		const perl = await ZeroPerl.create();
		const original = {
			str: "hello",
			num: 42,
			bool: true,
			nil: null,
		};

		const hash = await perl.createHash(original);
		const result = await hash.project();

		expect(result).toEqual(original);

		await hash.dispose();
		await perl.dispose();
	});

	it("should handle nested objects", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash({
			name: "Alice",
			data: {
				age: 30,
				city: "NYC",
			},
		});

		const name = await hash.get("name");
		expect(await name?.toString()).toBe("Alice");

		const data = await hash.get("data");
		expect(await data?.isRef()).toBe(true);

		await name?.dispose();
		await data?.dispose();
		await hash.dispose();
		await perl.dispose();
	});

	it("should throw error when using disposed PerlHash", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash();
		await hash.dispose();

		await expect(async () => {
			await hash.has("key");
		}).toThrow("PerlHash has been disposed");

		await perl.dispose();
	});
});

describe("Variables", () => {
	it("should set and get scalar variables with primitives", async () => {
		const perl = await ZeroPerl.create();

		await perl.setVariable("name", "Alice");
		await perl.setVariable("age", 30);
		await perl.setVariable("active", true);

		const name = await perl.getVariable("name");
		expect(await name?.toString()).toBe("Alice");

		const age = await perl.getVariable("age");
		expect(await age?.toInt()).toBe(30);

		const active = await perl.getVariable("active");
		expect(await active?.toBoolean()).toBe(true);

		await name?.dispose();
		await age?.dispose();
		await active?.dispose();
		await perl.dispose();
	});

	it("should set variables with PerlValue", async () => {
		const perl = await ZeroPerl.create();

		const val = await perl.createString("test");
		await perl.setVariable("myvar", val);

		const retrieved = await perl.getVariable("myvar");
		expect(await retrieved?.toString()).toBe("test");

		await val.dispose();
		await retrieved?.dispose();
		await perl.dispose();
	});

	it("should set variables with arrays", async () => {
		const perl = await ZeroPerl.create();

		await perl.setVariable("numbers", [1, 2, 3, 4, 5]);

		const val = await perl.getVariable("numbers");
		expect(await val?.isRef()).toBe(true);

		await val?.dispose();
		await perl.dispose();
	});

	it("should set variables with objects", async () => {
		const perl = await ZeroPerl.create();

		await perl.setVariable("user", {
			name: "Alice",
			age: 30,
		});

		const val = await perl.getVariable("user");
		expect(await val?.isRef()).toBe(true);

		await val?.dispose();
		await perl.dispose();
	});

	it("should return null for non-existent variables", async () => {
		const perl = await ZeroPerl.create();

		const value = await perl.getVariable("nonexistent");
		expect(value).toBeNull();

		await perl.dispose();
	});

	it("should get and set array variables", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval("@myarray = (1, 2, 3)");

		const arr = await perl.getArrayVariable("myarray");
		expect(await arr?.getLength()).toBe(3);

		await arr?.dispose();
		await perl.dispose();
	});

	it("should get and set hash variables", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval("%myhash = (a => 1, b => 2)");

		const hash = await perl.getHashVariable("myhash");
		expect(await hash?.has("a")).toBe(true);
		expect(await hash?.has("b")).toBe(true);

		await hash?.dispose();
		await perl.dispose();
	});

	it("should overwrite existing variables", async () => {
		const perl = await ZeroPerl.create();

		await perl.setVariable("var", "first");
		let val = await perl.getVariable("var");
		expect(await val?.toString()).toBe("first");

		await perl.setVariable("var", "second");
		val = await perl.getVariable("var");
		expect(await val?.toString()).toBe("second");

		await val?.dispose();
		await perl.dispose();
	});
});

describe("Host Functions", () => {
	it("should register and call host functions", async () => {
		let output = "";
		const perl = await ZeroPerl.create({
			stderr: (data) => {
				output += typeof data === "string" ? data : new TextDecoder().decode(data);
			},
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.registerFunction("double", async (x) => {
			const num = await x.toInt();
			return await perl.createInt(num * 2);
		});

		await perl.eval("print double(21)");
		await perl.flush();

		expect(output).toBe("42");

		await perl.dispose();
	});

	it("should register host methods", async () => {
		const perl = await ZeroPerl.create();

		await perl.registerMethod("Math", "square", async (x) => {
			const num = await x.toInt();
			return await perl.createInt(num * num);
		});

		await perl.eval("$result = Math::square(7)");
		const result = await perl.getVariable("result");
		expect(await result?.toInt()).toBe(49);

		await result?.dispose();
		await perl.dispose();
	});

	it("should handle async host functions", async () => {
		const perl = await ZeroPerl.create();

		await perl.registerFunction("async_func", async (x) => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			const num = await x.toInt();
			return await perl.createInt(num + 1);
		});

		await perl.eval("$result = async_func(41)");
		const result = await perl.getVariable("result");
		expect(await result?.toInt()).toBe(42);

		await result?.dispose();
		await perl.dispose();
	});

	it("should handle host functions with multiple arguments", async () => {
		const perl = await ZeroPerl.create();

		await perl.registerFunction("add", async (a, b) => {
			const x = await a.toInt();
			const y = await b.toInt();
			return await perl.createInt(x + y);
		});

		await perl.eval("$sum = add(10, 32)");
		const sum = await perl.getVariable("sum");
		expect(await sum?.toInt()).toBe(42);

		await sum?.dispose();
		await perl.dispose();
	});

	it("should handle host functions returning different types", async () => {
		const perl = await ZeroPerl.create();

		await perl.registerFunction("get_string", async () => {
			return await perl.createString("hello");
		});

		await perl.registerFunction("get_array", async () => {
			const arr = await perl.createArray();
			await arr.push(1);
			await arr.push(2);
			return await arr.toValue();
		});

		await perl.eval("$str = get_string()");
		const str = await perl.getVariable("str");
		expect(await str?.toString()).toBe("hello");

		await str?.dispose();
		await perl.dispose();
	});

	it("should handle void host functions", async () => {
		const perl = await ZeroPerl.create();
		let called = false;

		await perl.registerFunction("set_flag", async () => {
			called = true;
		});

		await perl.eval("set_flag()");
		expect(called).toBe(true);

		await perl.dispose();
	});

	it("should handle host function errors", async () => {
		const perl = await ZeroPerl.create();

		await perl.registerFunction("divide", async (a, b) => {
			const x = await a.toInt();
			const y = await b.toInt();
			if (y === 0) {
				throw new Error("Division by zero");
			}
			return await perl.createInt(x / y);
		});

		const result = await perl.eval(`
        eval { $result = divide(10, 0) };
        $error = $@;
    `);

		expect(result.success).toBe(true);

		const error = await perl.getVariable("error");
		expect(await error?.toString()).toContain("Division by zero");

		await error?.dispose();
		await perl.dispose();
	});

	it("should propagate host function errors", async () => {
		const perl = await ZeroPerl.create();

		await perl.registerFunction("fail", async () => {
			throw new Error("Host function failed");
		});

		const result = await perl.eval("$x = fail()");

		expect(result.success).toBe(false);
		expect(result.error).toContain("Host function failed");

		await perl.dispose();
	});

	it("should handle host function errors with custom messages", async () => {
		const perl = await ZeroPerl.create();

		await perl.registerFunction("validate", async (x) => {
			const num = await x.toInt();
			if (num < 0) {
				throw new Error("Value must be positive");
			}
			if (num > 100) {
				throw new Error("Value must be less than 100");
			}
			return await perl.createInt(num);
		});

		let result = await perl.eval(`
        eval { $result = validate(-5) };
        $error1 = $@;
    `);
		expect(result.success).toBe(true);

		let error = await perl.getVariable("error1");
		expect(await error?.toString()).toContain("Value must be positive");
		await error?.dispose();

		result = await perl.eval(`
        eval { $result = validate(150) };
        $error2 = $@;
    `);
		expect(result.success).toBe(true);

		error = await perl.getVariable("error2");
		expect(await error?.toString()).toContain("Value must be less than 100");
		await error?.dispose();

		await perl.dispose();
	});
});

describe("Calling Perl from JavaScript", () => {
	it("should call Perl subroutines in scalar context", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval('sub greet { my ($name) = @_; return "Hello, $name!"; }');

		const arg = await perl.createString("Alice");
		const result = await perl.call("greet", [arg], "scalar");

		expect(await result?.toString()).toBe("Hello, Alice!");

		await arg.dispose();
		await result?.dispose();
		await perl.dispose();
	});

	it("should call Perl subroutines with default scalar context", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval('sub greet { my ($name) = @_; return "Hello, $name!"; }');

		const arg = await perl.createString("Alice");
		const result = await perl.call("greet", [arg]);

		expect(await result?.toString()).toBe("Hello, Alice!");

		await arg.dispose();
		await result?.dispose();
		await perl.dispose();
	});

	it("should call Perl subroutines with multiple arguments", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval("sub add { my ($a, $b) = @_; return $a + $b; }");

		const arg1 = await perl.createInt(10);
		const arg2 = await perl.createInt(32);
		const result = await perl.call("add", [arg1, arg2], "scalar");

		expect(await result?.toInt()).toBe(42);

		await arg1.dispose();
		await arg2.dispose();
		await result?.dispose();
		await perl.dispose();
	});

	it("should call Perl subroutines in list context", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval("sub get_values { return (1, 2, 3); }");

		const results = await perl.call("get_values", [], "list");

		expect(results.length).toBe(3);
		expect(await results[0].toInt()).toBe(1);
		expect(await results[1].toInt()).toBe(2);
		expect(await results[2].toInt()).toBe(3);

		for (const r of results) {
			await r.dispose();
		}
		await perl.dispose();
	});

	it("should call Perl subroutines in void context", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval("sub set_global { $::global = 42; }");

		const result = await perl.call("set_global", [], "void");

		expect(result).toBeUndefined();

		const global = await perl.getVariable("global");
		expect(await global?.toInt()).toBe(42);

		await global?.dispose();
		await perl.dispose();
	});

	it("should call Perl subroutines without arguments", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval("sub get_pi { return 3.14159; }");

		const result = await perl.call("get_pi");

		expect(await result?.toDouble()).toBeCloseTo(Math.PI, 5);

		await result?.dispose();
		await perl.dispose();
	});

	it("should handle Perl subroutine errors", async () => {
		const perl = await ZeroPerl.create();
		await perl.eval('sub fail_sub { die "Subroutine failed"; }');
		const result = await perl.call("fail_sub");
		expect(result).toBeNull();
		const error = await perl.getLastError();
		expect(error).toContain("Subroutine failed");
		await perl.dispose();
	});
});

describe("File System", () => {
	it("should run script files", async () => {
		const fs = new MemoryFileSystem({ "/": "/" });
		fs.addFile("/test.pl", 'print "Hello from file!"');

		let output = "";
		const perl = await ZeroPerl.create({
			fileSystem: fs,
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		const result = await perl.runFile("/test.pl");
		await perl.flush();
		console.log(result);

		expect(result.success).toBe(true);
		expect(output).toBe("Hello from file!");

		await perl.dispose();
	});

	it("should run script files with arguments", async () => {
		const fs = new MemoryFileSystem({ "/": "" });
		fs.addFile("/script.pl", 'print "Args: @ARGV"');

		let output = "";
		const perl = await ZeroPerl.create({
			fileSystem: fs,
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.runFile("/script.pl", ["one", "two"]);
		await perl.flush();

		expect(output).toBe("Args: one two");

		await perl.dispose();
	});

	it("should read data files", async () => {
		const fs = new MemoryFileSystem({ "/": "" });
		fs.addFile("/data.txt", "Hello from file system!");

		let output = "";
		const perl = await ZeroPerl.create({
			fileSystem: fs,
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.eval(`
            open my $fh, '<', '/data.txt' or die $!;
            my $content = <$fh>;
            print $content;
            close $fh;
        `);
		await perl.flush();

		expect(output).toBe("Hello from file system!");

		await perl.dispose();
	});

	it("should handle file not found errors", async () => {
		const fs = new MemoryFileSystem({ "/": "" });
		const perl = await ZeroPerl.create({ fileSystem: fs });

		const result = await perl.runFile("/nonexistent.pl");
		expect(result.success).toBe(false);
		expect(result.error).toContain("No such file or directory");

		await perl.dispose();
	});

	it("should handle File and Blob objects", async () => {
		const fs = new MemoryFileSystem({ "/": "" });

		const file = new File(["File content"], "test.txt");
		const blob = new Blob(["Blob content"]);

		fs.addFile("/file.txt", file);
		fs.addFile("/blob.txt", blob);

		let output = "";
		const perl = await ZeroPerl.create({
			fileSystem: fs,
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.eval(`
            open my $fh, '<', '/file.txt';
            print <$fh>;
            close $fh;
            print " ";
            open $fh, '<', '/blob.txt';
            print <$fh>;
            close $fh;
        `);
		await perl.flush();

		expect(output).toBe("File content Blob content");

		await perl.dispose();
	});
});

describe("Output Handling", () => {
	it("should capture stdout", async () => {
		let output = "";
		const perl = await ZeroPerl.create({
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.eval('print "hello"');
		await perl.flush();

		expect(output).toBe("hello");

		await perl.dispose();
	});

	it("should capture stderr separately", async () => {
		let stdout = "";
		let stderr = "";

		const perl = await ZeroPerl.create({
			stdout: (data) => {
				stdout +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
			stderr: (data) => {
				stderr +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.eval('print "to stdout"; warn "to stderr"');
		await perl.flush();

		expect(stdout).toBe("to stdout");
		expect(stderr).toContain("to stderr");

		await perl.dispose();
	});

	it("should handle multiple eval calls with output", async () => {
		let output = "";
		const perl = await ZeroPerl.create({
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.eval('print "first "');
		await perl.flush();
		await perl.eval('print "second"');
		await perl.flush();

		expect(output).toBe("first second");

		await perl.dispose();
	});

	it("should handle binary data output", async () => {
		let output = new Uint8Array();
		const perl = await ZeroPerl.create({
			stdout: (data) => {
				const bytes = typeof data === "string"
					? new TextEncoder().encode(data)
					: data;
				const combined = new Uint8Array(output.length + bytes.length);
				combined.set(output);
				combined.set(bytes, output.length);
				output = combined;
			},
		});

		await perl.eval('print "test"');
		await perl.flush();

		expect(new TextDecoder().decode(output)).toBe("test");

		await perl.dispose();
	});
});

describe("Environment", () => {
	it("should pass environment variables", async () => {
		let output = "";
		const perl = await ZeroPerl.create({
			env: { MY_VAR: "test_value", ANOTHER: "value2" },
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.eval('print $ENV{MY_VAR} . " " . $ENV{ANOTHER}');
		await perl.flush();

		expect(output).toBe("test_value value2");

		await perl.dispose();
	});

	it("should handle missing environment variables", async () => {
		let output = "";
		const perl = await ZeroPerl.create({
			env: {},
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.eval('print defined($ENV{NONEXISTENT}) ? "defined" : "undefined"');
		await perl.flush();

		expect(output).toBe("undefined");

		await perl.dispose();
	});
});

describe("Complex Scenarios", () => {
	it("should handle complex nested data structures", async () => {
		const perl = await ZeroPerl.create();

		await perl.setVariable("config", {
			server: {
				host: "localhost",
				port: 8080,
				ssl: true,
			},
			databases: [
				{ name: "main", host: "db1.example.com" },
				{ name: "cache", host: "db2.example.com" },
			],
			features: ["auth", "logging", "metrics"],
		});

		const val = await perl.getVariable("config");
		expect(await val?.isRef()).toBe(true);

		await val?.dispose();
		await perl.dispose();
	});

	it("should maintain state across operations", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval("$counter = 0");
		await perl.eval("$counter++");
		await perl.eval("$counter++");

		const counter = await perl.getVariable("counter");
		expect(await counter?.toInt()).toBe(2);

		await counter?.dispose();
		await perl.dispose();
	});

	it("should handle errors without losing state", async () => {
		const perl = await ZeroPerl.create();

		await perl.setVariable("x", 42);

		await perl.eval('die "error"');

		const x = await perl.getVariable("x");
		expect(await x?.toInt()).toBe(42);

		await x?.dispose();
		await perl.dispose();
	});

	it("should handle loops and complex logic", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval(`
            @array = (1, 2, 3, 4, 5);
            $sum = 0;
            foreach my $num (@array) {
                $sum += $num;
            }
        `);

		const sum = await perl.getVariable("sum");
		expect(await sum?.toInt()).toBe(15);

		await sum?.dispose();
		await perl.dispose();
	});

	it("should work with JavaScript data in Perl code", async () => {
		let output = "";
		const perl = await ZeroPerl.create({
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.setVariable("user", {
			name: "Alice",
			age: 30,
			scores: [95, 87, 92],
		});

		await perl.eval('print "$user->{name} is $user->{age} years old"');
		await perl.flush();

		expect(output).toBe("Alice is 30 years old");

		await perl.dispose();
	});

	it("should handle large data structures", async () => {
		const perl = await ZeroPerl.create();

		const largeArray = Array.from({ length: 1000 }, (_, i) => i);
		await perl.setVariable("numbers", largeArray);

		await perl.eval(`
            $sum = 0;
            foreach my $num (@$numbers) {
                $sum += $num;
            }
        `);

		const sum = await perl.getVariable("sum");
		expect(await sum?.toInt()).toBe(499500); // Sum of 0 to 999

		await sum?.dispose();
		await perl.dispose();
	});

	it("should handle deeply nested structures", async () => {
		let output = "";
		const perl = await ZeroPerl.create({
			stdout: (data) => {
				output += typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		const nested = {
			level1: {
				level2: {
					level3: {
						level4: {
							value: "deep",
						},
					},
				},
			},
		};

		await perl.setVariable("nested", nested);

		const r = await perl.eval('use Data::Dumper; print Dumper($nested);');
		await perl.flush();
		console.log(r, output);
		expect(output).toContain("'value' => 'deep'");
		await perl.dispose();
	});
});

describe("Edge Cases", () => {
	it("should handle empty strings", async () => {
		const perl = await ZeroPerl.create();
		const val = await perl.createString("");

		expect(await val.toString()).toBe("");
		expect(await val.project()).toBe("");

		await val.dispose();
		await perl.dispose();
	});

	it("should handle special characters in strings", async () => {
		const perl = await ZeroPerl.create();
		const special = "Hello\nWorld\t!\0End";
		const val = await perl.createString(special);

		expect(await val.toString()).toBe(special);

		await val.dispose();
		await perl.dispose();
	});

	it("should handle Unicode strings", async () => {
		const perl = await ZeroPerl.create();
		const unicode = "Hello 世界 🌍";
		const val = await perl.createString(unicode);

		expect(await val.toString()).toBe(unicode);

		await val.dispose();
		await perl.dispose();
	});

	it("should handle zero values", async () => {
		const perl = await ZeroPerl.create();
		const zero = await perl.createInt(0);

		expect(await zero.toInt()).toBe(0);
		expect(await zero.toBoolean()).toBe(false);

		await zero.dispose();
		await perl.dispose();
	});

	it("should handle negative numbers", async () => {
		const perl = await ZeroPerl.create();
		const neg = await perl.createInt(-42);

		expect(await neg.toInt()).toBe(-42);

		await neg.dispose();
		await perl.dispose();
	});

	it("should handle very large numbers", async () => {
		const perl = await ZeroPerl.create();
		const large = await perl.createDouble(Number.MAX_SAFE_INTEGER);

		expect(await large.toDouble()).toBe(Number.MAX_SAFE_INTEGER);

		await large.dispose();
		await perl.dispose();
	});

	it("should handle empty arrays", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray([]);

		expect(await arr.getLength()).toBe(0);
		expect(await arr.project()).toEqual([]);

		await arr.dispose();
		await perl.dispose();
	});

	it("should handle empty hashes", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash({});

		expect(await hash.project()).toEqual({});

		await hash.dispose();
		await perl.dispose();
	});

	it("should handle null in arrays", async () => {
		const perl = await ZeroPerl.create();
		const arr = await perl.createArray([1, null, 3]);

		const val = await arr.get(1);
		expect(await val?.isUndef()).toBe(true);

		await val?.dispose();
		await arr.dispose();
		await perl.dispose();
	});

	it("should handle null in hashes", async () => {
		const perl = await ZeroPerl.create();
		const hash = await perl.createHash({ key: null });

		const val = await hash.get("key");
		expect(await val?.isUndef()).toBe(true);

		await val?.dispose();
		await hash.dispose();
		await perl.dispose();
	});
});

describe("Error Handling", () => {
	it("should handle syntax errors", async () => {
		const perl = await ZeroPerl.create();
		const result = await perl.eval("$x = ;");

		expect(result.success).toBe(false);
		expect(result.error).toBeTruthy();

		await perl.dispose();
	});

	it("should handle runtime errors", async () => {
		const perl = await ZeroPerl.create();
		const result = await perl.eval("$x = 1 / 0");
		console.log(result);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Illegal division by zero");

		await perl.dispose();
	});

	it("should handle undefined variable access", async () => {
		const perl = await ZeroPerl.create();

		let output = "";
		const warnPerl = await ZeroPerl.create({
			stderr: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		const result = await warnPerl.eval("use warnings; print $undefined_var");
		await warnPerl.flush();
		console.log(result, output);

		expect(output).toContain("uninitialized");

		await perl.dispose();
		await warnPerl.dispose();
	});

	it("should recover from errors", async () => {
		const perl = await ZeroPerl.create();

		await perl.eval('die "error"');
		await perl.clearError();

		const result = await perl.eval("$x = 42");
		expect(result.success).toBe(true);

		await perl.dispose();
	});
});

describe("Creation Options", () => {
	it("should create with custom environment", async () => {
		const perl = await ZeroPerl.create({
			env: { CUSTOM: "value" },
		});

		let output = "";
		const testPerl = await ZeroPerl.create({
			env: { CUSTOM: "value" },
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await testPerl.eval('print $ENV{CUSTOM}');
		await testPerl.flush();

		expect(output).toBe("value");

		await perl.dispose();
		await testPerl.dispose();
	});

	it("should create with custom file system", async () => {
		const fs = new MemoryFileSystem({ "/": "" });
		fs.addFile("/test.txt", "content");

		const perl = await ZeroPerl.create({ fileSystem: fs });

		let output = "";
		const testPerl = await ZeroPerl.create({
			fileSystem: fs,
			stdout: (data) => {
				output +=
					typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await testPerl.eval(`
			open my $fh, '<', '/test.txt';
			print <$fh>;
			close $fh;
		`);
		await testPerl.flush();

		expect(output).toBe("content");

		await perl.dispose();
		await testPerl.dispose();
	});

	it("should create with output handlers", async () => {
		let stdout = "";
		let stderr = "";

		const perl = await ZeroPerl.create({
			stdout: (data) => {
				stdout += typeof data === "string" ? data : new TextDecoder().decode(data);
			},
			stderr: (data) => {
				stderr += typeof data === "string" ? data : new TextDecoder().decode(data);
			},
		});

		await perl.eval('print "out"; warn "err"');
		await perl.flush();

		expect(stdout).toBe("out");
		expect(stderr).toContain("err");

		await perl.dispose();
	});

	describe("Unicode Character Handling", () => {
		describe("Korean (한국어) Characters", () => {
			it("should create and retrieve Korean strings", async () => {
				const perl = await ZeroPerl.create();
				const koreanText = "안녕하세요";
				const val = await perl.createString(koreanText);

				expect(await val.toString()).toBe(koreanText);
				expect(await val.project()).toBe(koreanText);
				expect((await val.toString()).length).toBe(5);

				await val.dispose();
				await perl.dispose();
			});

			it("should handle Korean text in variables", async () => {
				const perl = await ZeroPerl.create();
				const koreanText = "김철수";

				await perl.setVariable("name", koreanText);
				const retrieved = await perl.getVariable("name");

				expect(await retrieved?.toString()).toBe(koreanText);
				expect(await retrieved?.toString()).not.toMatch(/[�]/);

				await retrieved?.dispose();
				await perl.dispose();
			});

			it("should handle Korean text with special characters", async () => {
				const perl = await ZeroPerl.create();
				const koreanText = "안녕하세요! 반갑습니다? (한국어)";

				await perl.setVariable("greeting", koreanText);
				const retrieved = await perl.getVariable("greeting");

				expect(await retrieved?.toString()).toBe(koreanText);

				await retrieved?.dispose();
				await perl.dispose();
			});

			it("should output Korean text correctly", async () => {
				let output = "";
				const perl = await ZeroPerl.create({
					stdout: (data) => {
						output += typeof data === "string" ? data : new TextDecoder().decode(data);
					},
				});

				const koreanText = "안녕하세요";
				await perl.setVariable("msg", koreanText);
				await perl.eval('print $msg');
				await perl.flush();

				expect(output).toBe(koreanText);
				expect(output).not.toMatch(/[�]/);

				await perl.dispose();
			});
		});

		describe("Japanese (日本語) Characters", () => {
			it("should create and retrieve Japanese strings", async () => {
				const perl = await ZeroPerl.create();
				const japaneseText = "こんにちは世界";
				const val = await perl.createString(japaneseText);

				expect(await val.toString()).toBe(japaneseText);
				expect(await val.project()).toBe(japaneseText);

				await val.dispose();
				await perl.dispose();
			});

			it("should handle mixed Hiragana, Katakana, and Kanji", async () => {
				const perl = await ZeroPerl.create();
				const japaneseText = "ひらがな カタカナ 漢字";

				await perl.setVariable("text", japaneseText);
				const retrieved = await perl.getVariable("text");

				expect(await retrieved?.toString()).toBe(japaneseText);

				await retrieved?.dispose();
				await perl.dispose();
			});

			it("should handle Japanese text in arrays", async () => {
				const perl = await ZeroPerl.create();
				const items = ["東京", "大阪", "京都"];
				const arr = await perl.createArray(items);

				expect(await arr.getLength()).toBe(3);

				const val0 = await arr.get(0);
				expect(await val0?.toString()).toBe("東京");

				const val1 = await arr.get(1);
				expect(await val1?.toString()).toBe("大阪");

				const projected = await arr.project();
				expect(projected).toEqual(items);

				await val0?.dispose();
				await val1?.dispose();
				await arr.dispose();
				await perl.dispose();
			});
		});

		describe("Chinese (中文) Characters", () => {
			it("should handle Simplified Chinese text", async () => {
				const perl = await ZeroPerl.create();
				const chineseText = "你好世界";
				const val = await perl.createString(chineseText);

				expect(await val.toString()).toBe(chineseText);
				expect(await val.toString()).not.toMatch(/[�]/);

				await val.dispose();
				await perl.dispose();
			});

			it("should handle Traditional Chinese text", async () => {
				const perl = await ZeroPerl.create();
				const chineseText = "繁體中文測試";

				await perl.setVariable("text", chineseText);
				const retrieved = await perl.getVariable("text");

				expect(await retrieved?.toString()).toBe(chineseText);

				await retrieved?.dispose();
				await perl.dispose();
			});

			it("should handle Chinese text in hashes", async () => {
				const perl = await ZeroPerl.create();
				const data = {
					城市: "北京",
					国家: "中国",
				};
				const hash = await perl.createHash(data);

				const city = await hash.get("城市");
				expect(await city?.toString()).toBe("北京");

				const country = await hash.get("国家");
				expect(await country?.toString()).toBe("中国");

				await city?.dispose();
				await country?.dispose();
				await hash.dispose();
				await perl.dispose();
			});
		});

		describe("Mixed Unicode and Multilingual", () => {
			it("should handle mixed language text", async () => {
				const perl = await ZeroPerl.create();
				const mixedText = "Hello 안녕하세요 こんにちは 你好";
				const val = await perl.createString(mixedText);

				expect(await val.toString()).toBe(mixedText);

				await val.dispose();
				await perl.dispose();
			});

			it("should handle emoji and extended Unicode", async () => {
				const perl = await ZeroPerl.create();
				const emojiText = "📷 Photo by 김철수 🌸";
				const val = await perl.createString(emojiText);

				expect(await val.toString()).toBe(emojiText);

				await val.dispose();
				await perl.dispose();
			});

			it("should handle Unicode in nested structures", async () => {
				const perl = await ZeroPerl.create();
				const nested = {
					user: {
						name: "田中太郎",
						city: "東京",
					},
					tags: ["写真", "旅行", "食べ物"],
				};

				await perl.setVariable("data", nested);
				const retrieved = await perl.getVariable("data");

				expect(await retrieved?.isRef()).toBe(true);

				await retrieved?.dispose();
				await perl.dispose();
			});

			it("should round-trip Unicode arrays", async () => {
				const perl = await ZeroPerl.create();
				const original = ["Hello", "안녕", "こんにちは", "你好", "🌍"];
				const arr = await perl.createArray(original);
				const result = await arr.project();

				expect(result).toEqual(original);

				await arr.dispose();
				await perl.dispose();
			});

			it("should round-trip Unicode hashes", async () => {
				const perl = await ZeroPerl.create();
				const original = {
					english: "Hello",
					korean: "안녕하세요",
					japanese: "こんにちは",
					chinese: "你好",
					emoji: "🎉",
				};
				const hash = await perl.createHash(original);
				const result = await hash.project();

				expect(result).toEqual(original);

				await hash.dispose();
				await perl.dispose();
			});
		});

		describe("Unicode in Perl Operations", () => {
			it("should handle Unicode in eval code with 'use utf8' pragma", async () => {
				const perl = await ZeroPerl.create();
				const result = await perl.eval('use utf8; $greeting = "안녕하세요"');

				expect(result.success).toBe(true);

				const greeting = await perl.getVariable("greeting");
				expect(await greeting?.toString()).toBe("안녕하세요");

				await greeting?.dispose();
				await perl.dispose();
			});

			it("should handle Unicode in Perl string operations with 'use utf8' pragma", async () => {
				let output = "";
				const perl = await ZeroPerl.create({
					stdout: (data) => {
						output += typeof data === "string" ? data : new TextDecoder().decode(data);
					},
				});

				await perl.setVariable("name", "김철수");
				await perl.eval('use utf8; $msg = "안녕하세요, $name!"; print $msg');
				await perl.flush();

				expect(output).toBe("안녕하세요, 김철수!");

				await perl.dispose();
			});

			it("should handle Unicode passed via setVariable without pragma", async () => {
				let output = "";
				const perl = await ZeroPerl.create({
					stdout: (data) => {
						output += typeof data === "string" ? data : new TextDecoder().decode(data);
					},
				});

				await perl.setVariable("greeting", "안녕하세요");
				await perl.setVariable("name", "김철수");
				await perl.eval('print "$greeting, $name!"');
				await perl.flush();

				expect(output).toBe("안녕하세요, 김철수!");

				await perl.dispose();
			});

			it("should handle Unicode in host functions with pragma", async () => {
				const perl = await ZeroPerl.create();

				await perl.registerFunction("greet", async (name) => {
					const n = await name.toString();
					return await perl.createString(`안녕하세요, ${n}!`);
				});
				await perl.eval('use utf8; $result = greet("田中")');
				const result = await perl.getVariable("result");

				expect(await result?.toString()).toBe("안녕하세요, 田中!");

				await result?.dispose();
				await perl.dispose();
			});

			it("should handle Unicode in host functions via setVariable", async () => {
				const perl = await ZeroPerl.create();

				await perl.registerFunction("greet", async (name) => {
					const n = await name.toString();
					return await perl.createString(`안녕하세요, ${n}!`);
				});

				await perl.setVariable("name_arg", "田中");
				await perl.eval('$result = greet($name_arg)');
				const result = await perl.getVariable("result");

				expect(await result?.toString()).toBe("안녕하세요, 田中!");

				await result?.dispose();
				await perl.dispose();
			});

			it("should handle Unicode in Perl subroutine calls", async () => {
				const perl = await ZeroPerl.create();

				await perl.eval('sub echo { return $_[0]; }');

				const arg = await perl.createString("こんにちは世界");
				const result = await perl.call("echo", [arg], "scalar");

				expect(await result?.toString()).toBe("こんにちは世界");

				await arg.dispose();
				await result?.dispose();
				await perl.dispose();
			});

			it("should corrupt Unicode in source code without 'use utf8' pragma", async () => {
				const perl = await ZeroPerl.create();
				const result = await perl.eval('$greeting = "안녕하세요"');

				expect(result.success).toBe(true);

				const greeting = await perl.getVariable("greeting");
				const retrieved = await greeting?.toString();

				expect(retrieved).not.toBe("안녕하세요");
				expect(retrieved?.length).toBeGreaterThan(5);

				await greeting?.dispose();
				await perl.dispose();
			});
		});

		describe("Unicode Byte Length Validation", () => {
			it("should preserve correct byte length for Korean text", async () => {
				const perl = await ZeroPerl.create();
				const koreanText = "안녕하세요";
				const expectedByteLength = new TextEncoder().encode(koreanText).length;

				const val = await perl.createString(koreanText);
				const retrieved = await val.toString();
				const actualByteLength = new TextEncoder().encode(retrieved).length;

				expect(actualByteLength).toBe(expectedByteLength);
				expect(retrieved.length).toBe(koreanText.length);

				await val.dispose();
				await perl.dispose();
			});

			it("should preserve correct byte length for emoji", async () => {
				const perl = await ZeroPerl.create();
				const emojiText = "🎉🌸📷";
				const expectedByteLength = new TextEncoder().encode(emojiText).length;

				const val = await perl.createString(emojiText);
				const retrieved = await val.toString();
				const actualByteLength = new TextEncoder().encode(retrieved).length;

				expect(actualByteLength).toBe(expectedByteLength);

				await val.dispose();
				await perl.dispose();
			});
		});

		describe("Unicode Edge Cases", () => {
			it("should handle very long Unicode text", async () => {
				const perl = await ZeroPerl.create();
				const longText = "안녕하세요".repeat(100);

				const val = await perl.createString(longText);
				const retrieved = await val.toString();

				expect(retrieved).toBe(longText);
				expect(retrieved.length).toBe(500);

				await val.dispose();
				await perl.dispose();
			});

			it("should handle Unicode with null bytes", async () => {
				const perl = await ZeroPerl.create();
				const text = "안녕\0하세요";

				const val = await perl.createString(text);
				const retrieved = await val.toString();

				expect(retrieved).toBe(text);

				await val.dispose();
				await perl.dispose();
			});

			it("should handle Unicode newlines and whitespace", async () => {
				const perl = await ZeroPerl.create();
				const text = "こんにちは\n世界\t日本";

				const val = await perl.createString(text);
				const retrieved = await val.toString();

				expect(retrieved).toBe(text);

				await val.dispose();
				await perl.dispose();
			});

			it("should detect corruption via replacement characters", async () => {
				const perl = await ZeroPerl.create();
				const koreanText = "안녕하세요";

				await perl.setVariable("text", koreanText);
				const retrieved = await perl.getVariable("text");
				const result = await retrieved?.toString();

				expect(result).not.toContain("�");
				expect(result).not.toContain("HUX8");
				expect(result).toMatch(/[\u3131-\uD79D]/); // Contains Hangul

				await retrieved?.dispose();
				await perl.dispose();
			});

			it("should handle combining characters", async () => {
				const perl = await ZeroPerl.create();
				// Korean with combining jamo
				const text = "가나다라마";

				const val = await perl.createString(text);
				const retrieved = await val.toString();

				expect(retrieved).toBe(text);

				await val.dispose();
				await perl.dispose();
			});
		});
	});
});