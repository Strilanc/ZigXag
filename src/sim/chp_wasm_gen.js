// Copyright 2010 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// {{PRE_JSES}}

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

var arguments_ = [];
var thisProgram = './this.program';
var quit_ = function(status, toThrow) {
  throw toThrow;
};

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_HAS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;
ENVIRONMENT_IS_WEB = typeof window === 'object';
ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
// A web environment like Electron.js can have Node enabled, so we must
// distinguish between Node-enabled environments and Node environments per se.
// This will allow the former to do things like mount NODEFS.
// Extended check using process.versions fixes issue #8816.
// (Also makes redundant the original check that 'require' is a function.)
ENVIRONMENT_HAS_NODE = typeof process === 'object' && typeof process.versions === 'object' && typeof process.versions.node === 'string';
ENVIRONMENT_IS_NODE = ENVIRONMENT_HAS_NODE && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;



// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)




// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var read_,
    readAsync,
    readBinary,
    setWindowTitle;

if (ENVIRONMENT_IS_NODE) {
  scriptDirectory = __dirname + '/';

  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  var nodeFS;
  var nodePath;

  read_ = function shell_read(filename, binary) {
    var ret;
    ret = tryParseAsDataURI(filename);
    if (!ret) {
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    }
    return binary ? ret : ret.toString();
  };

  readBinary = function readBinary(filename) {
    var ret = read_(filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (process['argv'].length > 1) {
    thisProgram = process['argv'][1].replace(/\\/g, '/');
  }

  arguments_ = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  process['on']('unhandledRejection', abort);

  quit_ = function(status) {
    process['exit'](status);
  };

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
} else
if (ENVIRONMENT_IS_SHELL) {


  if (typeof read != 'undefined') {
    read_ = function shell_read(f) {
      var data = tryParseAsDataURI(f);
      if (data) {
        return intArrayToString(data);
      }
      return read(f);
    };
  }

  readBinary = function readBinary(f) {
    var data;
    data = tryParseAsDataURI(f);
    if (data) {
      return data;
    }
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    arguments_ = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    arguments_ = arguments;
  }

  if (typeof quit === 'function') {
    quit_ = function(status) {
      quit(status);
    };
  }

  if (typeof print !== 'undefined') {
    // Prefer to use print/printErr where they exist, as they usually work better.
    if (typeof console === 'undefined') console = {};
    console.log = print;
    console.warn = console.error = typeof printErr !== 'undefined' ? printErr : print;
  }
} else
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) { // Check worker, not web, since window could be polyfilled
    scriptDirectory = self.location.href;
  } else if (document.currentScript) { // web
    scriptDirectory = document.currentScript.src;
  }
  // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
  // otherwise, slice off the final part of the url to find the script directory.
  // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
  // and scriptDirectory will correctly be replaced with an empty string.
  if (scriptDirectory.indexOf('blob:') !== 0) {
    scriptDirectory = scriptDirectory.substr(0, scriptDirectory.lastIndexOf('/')+1);
  } else {
    scriptDirectory = '';
  }


  read_ = function shell_read(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    } catch (err) {
      var data = tryParseAsDataURI(url);
      if (data) {
        return intArrayToString(data);
      }
      throw err;
    }
  };

  if (ENVIRONMENT_IS_WORKER) {
    readBinary = function readBinary(url) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
      } catch (err) {
        var data = tryParseAsDataURI(url);
        if (data) {
          return data;
        }
        throw err;
      }
    };
  }

  readAsync = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      var data = tryParseAsDataURI(url);
      if (data) {
        onload(data.buffer);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  setWindowTitle = function(title) { document.title = title };
} else
{
}

// Set up the out() and err() hooks, which are how we can print to stdout or
// stderr, respectively.
var out = Module['print'] || console.log.bind(console);
var err = Module['printErr'] || console.warn.bind(console);

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = null;

// Emit code to handle expected values on the Module object. This applies Module.x
// to the proper local x. This has two benefits: first, we only emit it if it is
// expected to arrive, and second, by using a local everywhere else that can be
// minified.
if (Module['arguments']) arguments_ = Module['arguments'];
if (Module['thisProgram']) thisProgram = Module['thisProgram'];
if (Module['quit']) quit_ = Module['quit'];

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message

// TODO remove when SDL2 is fixed (also see above)



// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;


function dynamicAlloc(size) {
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  if (end > _emscripten_get_heap_size()) {
    abort();
  }
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  return Math.ceil(size / factor) * factor;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0, 'getNativeTypeSize invalid bits ' + bits + ', type ' + type);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    err(text);
  }
}

var asm2wasmImports = { // special asm2wasm imports
    "f64-rem": function(x, y) {
        return x % y;
    },
    "debugger": function() {
    }
};



var jsCallStartIndex = 1;
var functionPointers = new Array(0);


// 'sig' parameter is required for the llvm backend but only when func is not
// already a WebAssembly function.
function addFunction(func, sig) {


  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';

}

function removeFunction(index) {

  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    return Module['dynCall_' + sig].call(null, ptr);
  }
}

var tempRet0 = 0;

var setTempRet0 = function(value) {
  tempRet0 = value;
};

var getTempRet0 = function() {
  return tempRet0;
};


var Runtime = {
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 8;




// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html


var wasmBinary;if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];
var noExitRuntime;if (Module['noExitRuntime']) noExitRuntime = Module['noExitRuntime'];




// In MINIMAL_RUNTIME, setValue() and getValue() are only available when building with safe heap enabled, for heap safety checking.
// In traditional runtime, setValue() and getValue() are always available (although their use is highly discouraged due to perf penalties)

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}





// Wasm globals

var wasmMemory;

// In fastcomp asm.js, we don't need a wasm Table at all.
// In the wasm backend, we polyfill the WebAssembly object,
// so this creates a (non-native-wasm) table for us.


//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

// C calling interface.
function ccall(ident, returnType, argTypes, args, opts) {
  // For fast lookup of conversion functions
  var toC = {
    'string': function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    },
    'array': function(arr) {
      var ret = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    }
  };

  function convertReturnValue(ret) {
    if (returnType === 'string') return UTF8ToString(ret);
    if (returnType === 'boolean') return Boolean(ret);
    return ret;
  }

  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);

  ret = convertReturnValue(ret);
  if (stack !== 0) stackRestore(stack);
  return ret;
}

function cwrap(ident, returnType, argTypes, opts) {
  argTypes = argTypes || [];
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs && !opts) {
    return getCFunc(ident);
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments, opts);
  }
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_DYNAMIC = 2; // Cannot be freed except through sbrk
var ALLOC_NONE = 3; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [_malloc,
    stackAlloc,
    dynamicAlloc][allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}




/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  abort("this function has been removed - you should use UTF8ToString(ptr, maxBytesToRead) instead!");
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAPU8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}


// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;

/**
 * @param {number} idx
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ArrayToString(u8Array, idx, maxBytesToRead) {
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  // (As a tiny code save trick, compare endPtr against endIdx using a negation, so that undefined means Infinity)
  while (u8Array[endPtr] && !(endPtr >= endIdx)) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var str = '';
    // If building with TextDecoder, we have already computed the string length above, so test loop end condition against that
    while (idx < endPtr) {
      // For UTF8 byte structure, see:
      // http://en.wikipedia.org/wiki/UTF-8#Description
      // https://www.ietf.org/rfc/rfc2279.txt
      // https://tools.ietf.org/html/rfc3629
      var u0 = u8Array[idx++];
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      var u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      var u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (u8Array[idx++] & 63);
      }

      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
  return str;
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns a
// copy of that string as a Javascript String object.
// maxBytesToRead: an optional length that specifies the maximum number of bytes to read. You can omit
//                 this parameter to scan the string until the first \0 byte. If maxBytesToRead is
//                 passed, and the string at [ptr, ptr+maxBytesToReadr[ contains a null byte in the
//                 middle, then the string will cut short at that byte index (i.e. maxBytesToRead will
//                 not produce a string of exact length [ptr, ptr+maxBytesToRead[)
//                 N.B. mixing frequent uses of UTF8ToString() with and without maxBytesToRead may
//                 throw JS JIT optimizations off, so it is worth to consider consistently using one
//                 style or the other.
/**
 * @param {number} ptr
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ToString(ptr, maxBytesToRead) {
  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array.
//                    This count should include the null terminator,
//                    i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) {
      var u1 = str.charCodeAt(++i);
      u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
    }
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.
function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) ++len;
    else if (u <= 0x7FF) len += 2;
    else if (u <= 0xFFFF) len += 3;
    else len += 4;
  }
  return len;
}


// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}




// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBufferAndViews(buf) {
  buffer = buf;
  Module['HEAP8'] = HEAP8 = new Int8Array(buf);
  Module['HEAP16'] = HEAP16 = new Int16Array(buf);
  Module['HEAP32'] = HEAP32 = new Int32Array(buf);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buf);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buf);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buf);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buf);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buf);
}


var STATIC_BASE = 8,
    STACK_BASE = 3504,
    STACKTOP = STACK_BASE,
    STACK_MAX = 5246384,
    DYNAMIC_BASE = 5246384,
    DYNAMICTOP_PTR = 3296;




var TOTAL_STACK = 5242880;

var INITIAL_TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;







// In standalone mode, the wasm creates the memory, and the user can't provide it.
// In non-standalone/normal mode, we create the memory here.

// Create the main memory. (Note: this isn't used in STANDALONE_WASM mode since the wasm
// memory is created in the wasm, not in JS.)

  if (Module['buffer']) {
    buffer = Module['buffer'];
  }
  else {
    buffer = new ArrayBuffer(INITIAL_TOTAL_MEMORY);
  }


// If the user provides an incorrect length, just use that length instead rather than providing the user to
// specifically provide the memory length with Module['TOTAL_MEMORY'].
INITIAL_TOTAL_MEMORY = buffer.byteLength;
updateGlobalBufferAndViews(buffer);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;










function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the main() is called

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {

  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }

  callRuntimeCallbacks(__ATPRERUN__);
}

function initRuntime() {
  runtimeInitialized = true;
  
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  runtimeExited = true;
}

function postRun() {

  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }

  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}



var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;



// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled

function getUniqueRunDependency(id) {
  return id;
}

function addRunDependency(id) {
  runDependencies++;

  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }

}

function removeRunDependency(id) {
  runDependencies--;

  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }

  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data


function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  what += '';
  out(what);
  err(what);

  ABORT = true;
  EXITSTATUS = 1;

  throw 'abort(' + what + '). Build with -s ASSERTIONS=1 for more info.';
}


var memoryInitializer = null;







// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}






// Globals used by JS i64 conversions
var tempDouble;
var tempI64;

// === Body ===

var ASM_CONSTS = [];





// STATICTOP = STATIC_BASE + 3496;
/* global initializers */  __ATINIT__.push({ func: function() { globalCtors() } });


memoryInitializer = "data:application/octet-stream;base64,AAAAAAAAAAAAAQAAUAAAAFABAABQAQAAQAEAAFAAAABQAQAAQAEAABABAAAAAAAAAAAAAAAAAAAYAQAAUAAAAEABAABAAQAAcAIAAIMDAADcAgAAiwMAAAAAAABQAAAA3AIAAJQDAAABAAAAUAAAAJgCAAAaBAAAiAAAAAAAAACYAgAAxwMAAJgAAAAAAAAAcAIAAOgDAACYAgAA9QMAAHgAAAAAAAAAmAIAADwEAACIAAAAAAAAAJgCAABeBAAAsAAAAAAAAACYAgAAggQAAIgAAAAAAAAAmAIAAKcEAACwAAAAAAAAAJgCAADVBAAAiAAAAAAAAADAAgAA/QQAAMACAAD/BAAAwAIAAAIFAADAAgAABAUAAMACAAAGBQAAwAIAAAgFAADAAgAACgUAAMACAAAMBQAAwAIAAA4FAADAAgAAEAUAAMACAAASBQAAwAIAABQFAADAAgAAFgUAAMACAAAYBQAAmAIAABoFAAB4AAAAAAAAAHACAABdCAAAcAIAAHwIAABwAgAAmwgAAHACAAC6CAAAcAIAANkIAABwAgAA+AgAAHACAAAXCQAAcAIAADYJAABwAgAAVQkAAHACAAB0CQAAcAIAAJMJAABwAgAAsgkAAHACAADRCQAA+AIAAOQJAAAAAAAAAQAAAAACAAAAAAAAcAIAACMKAAD4AgAASQoAAAAAAAABAAAAAAIAAAAAAAD4AgAAiAoAAAAAAAABAAAAAAIAAAAAAABYAAAAAAEAAFAAAABQAQAAAAEAAFAAAAAAAQAAUAAAAFAAAAAYAQAAUAAAAEABAAAAAAAAeAAAAAEAAAACAAAAAwAAAAQAAAABAAAAAQAAAAEAAAABAAAAAAAAAKAAAAABAAAABQAAAAMAAAAEAAAAAQAAAAIAAAACAAAAAgAAAAAAAADwAAAAAQAAAAYAAAADAAAABAAAAAIAAAAAAAAAwAAAAAEAAAAHAAAAAwAAAAQAAAADAAAAAAAAAHABAAABAAAACAAAAAMAAAAEAAAAAQAAAAMAAAADAAAAAwAAAFFTdGF0ZQBpbml0X3N0YXRlAGNub3QAaGFkYW1hcmQAcGhhc2UAbWVhc3VyZQBmcmVlX3N0YXRlAGNvcHlfc3RhdGUAcGVla19zdGF0ZV94AHBlZWtfc3RhdGVfegBwZWVrX3N0YXRlX3IANlFTdGF0ZQBQNlFTdGF0ZQBQSzZRU3RhdGUAaWkAdgB2aQB2aWlpAHZpaWlpAGlpaWlpaQB2aWkAaWlpaWkAaWlpaQBOMTBfX2N4eGFiaXYxMTZfX3NoaW1fdHlwZV9pbmZvRQBTdDl0eXBlX2luZm8ATjEwX19jeHhhYml2MTIwX19zaV9jbGFzc190eXBlX2luZm9FAE4xMF9fY3h4YWJpdjExN19fY2xhc3NfdHlwZV9pbmZvRQBOMTBfX2N4eGFiaXYxMTdfX3BiYXNlX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTE5X19wb2ludGVyX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTIwX19mdW5jdGlvbl90eXBlX2luZm9FAE4xMF9fY3h4YWJpdjEyOV9fcG9pbnRlcl90b19tZW1iZXJfdHlwZV9pbmZvRQBOMTBfX2N4eGFiaXYxMjNfX2Z1bmRhbWVudGFsX3R5cGVfaW5mb0UAdgBEbgBiAGMAaABhAHMAdABpAGoAbABtAGYAZABOMTBfX2N4eGFiaXYxMjFfX3ZtaV9jbGFzc190eXBlX2luZm9FAHZvaWQAYm9vbABjaGFyAHNpZ25lZCBjaGFyAHVuc2lnbmVkIGNoYXIAc2hvcnQAdW5zaWduZWQgc2hvcnQAaW50AHVuc2lnbmVkIGludABsb25nAHVuc2lnbmVkIGxvbmcAZmxvYXQAZG91YmxlAHN0ZDo6c3RyaW5nAHN0ZDo6YmFzaWNfc3RyaW5nPHVuc2lnbmVkIGNoYXI+AHN0ZDo6d3N0cmluZwBlbXNjcmlwdGVuOjp2YWwAZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8Y2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8c2lnbmVkIGNoYXI+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIGNoYXI+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHNob3J0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBzaG9ydD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBpbnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGxvbmc+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIGxvbmc+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludDhfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dWludDhfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50MTZfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dWludDE2X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludDMyX3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQzMl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxmbG9hdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8ZG91YmxlPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxsb25nIGRvdWJsZT4ATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJZUVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWRFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lmRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJbUVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWxFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lqRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJaUVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SXRFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lzRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJaEVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWFFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0ljRUUATjEwZW1zY3JpcHRlbjN2YWxFAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0l3TlNfMTFjaGFyX3RyYWl0c0l3RUVOU185YWxsb2NhdG9ySXdFRUVFAE5TdDNfXzIyMV9fYmFzaWNfc3RyaW5nX2NvbW1vbklMYjFFRUUATlN0M19fMjEyYmFzaWNfc3RyaW5nSWhOU18xMWNoYXJfdHJhaXRzSWhFRU5TXzlhbGxvY2F0b3JJaEVFRUUATlN0M19fMjEyYmFzaWNfc3RyaW5nSWNOU18xMWNoYXJfdHJhaXRzSWNFRU5TXzlhbGxvY2F0b3JJY0VFRUU=";





/* no memory initializer */
var tempDoublePtr = 3488

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much
  HEAP8[tempDoublePtr] = HEAP8[ptr];
  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];
  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];
  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];
}

function copyTempDouble(ptr) {
  HEAP8[tempDoublePtr] = HEAP8[ptr];
  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];
  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];
  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];
  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];
  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];
  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];
  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];
}

// {{PRE_LIBRARY}}


  function demangle(func) {
      return func;
    }

  function demangleAll(text) {
      var regex =
        /\b__Z[\w\d_]+/g;
      return text.replace(regex,
        function(x) {
          var y = demangle(x);
          return x === y ? x : (y + ' [' + x + ']');
        });
    }

  function jsStackTrace() {
      var err = new Error();
      if (!err.stack) {
        // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
        // so try that as a special-case.
        try {
          throw new Error(0);
        } catch(e) {
          err = e;
        }
        if (!err.stack) {
          return '(no stack trace available)';
        }
      }
      return err.stack.toString();
    }

  function stackTrace() {
      var js = jsStackTrace();
      if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
      return demangleAll(js);
    }

  
  function getShiftFromSize(size) {
      switch (size) {
          case 1: return 0;
          case 2: return 1;
          case 4: return 2;
          case 8: return 3;
          default:
              throw new TypeError('Unknown type size: ' + size);
      }
    }
  
  
  
  function embind_init_charCodes() {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
          codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    }var embind_charCodes=undefined;function readLatin1String(ptr) {
      var ret = "";
      var c = ptr;
      while (HEAPU8[c]) {
          ret += embind_charCodes[HEAPU8[c++]];
      }
      return ret;
    }
  
  
  var awaitingDependencies={};
  
  var registeredTypes={};
  
  var typeDependencies={};
  
  
  
  
  
  
  var char_0=48;
  
  var char_9=57;function makeLegalFunctionName(name) {
      if (undefined === name) {
          return '_unknown';
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, '$');
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
          return '_' + name;
      } else {
          return name;
      }
    }function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name);
      /*jshint evil:true*/
      return new Function(
          "body",
          "return function " + name + "() {\n" +
          "    \"use strict\";" +
          "    return body.apply(this, arguments);\n" +
          "};\n"
      )(body);
    }function extendError(baseErrorType, errorName) {
      var errorClass = createNamedFunction(errorName, function(message) {
          this.name = errorName;
          this.message = message;
  
          var stack = (new Error(message)).stack;
          if (stack !== undefined) {
              this.stack = this.toString() + '\n' +
                  stack.replace(/^Error(:[^\n]*)?\n/, '');
          }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function() {
          if (this.message === undefined) {
              return this.name;
          } else {
              return this.name + ': ' + this.message;
          }
      };
  
      return errorClass;
    }var BindingError=undefined;function throwBindingError(message) {
      throw new BindingError(message);
    }
  
  
  
  var InternalError=undefined;function throwInternalError(message) {
      throw new InternalError(message);
    }function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
      myTypes.forEach(function(type) {
          typeDependencies[type] = dependentTypes;
      });
  
      function onComplete(typeConverters) {
          var myTypeConverters = getTypeConverters(typeConverters);
          if (myTypeConverters.length !== myTypes.length) {
              throwInternalError('Mismatched type converter count');
          }
          for (var i = 0; i < myTypes.length; ++i) {
              registerType(myTypes[i], myTypeConverters[i]);
          }
      }
  
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach(function(dt, i) {
          if (registeredTypes.hasOwnProperty(dt)) {
              typeConverters[i] = registeredTypes[dt];
          } else {
              unregisteredTypes.push(dt);
              if (!awaitingDependencies.hasOwnProperty(dt)) {
                  awaitingDependencies[dt] = [];
              }
              awaitingDependencies[dt].push(function() {
                  typeConverters[i] = registeredTypes[dt];
                  ++registered;
                  if (registered === unregisteredTypes.length) {
                      onComplete(typeConverters);
                  }
              });
          }
      });
      if (0 === unregisteredTypes.length) {
          onComplete(typeConverters);
      }
    }function registerType(rawType, registeredInstance, options) {
      options = options || {};
  
      if (!('argPackAdvance' in registeredInstance)) {
          throw new TypeError('registerType registeredInstance requires argPackAdvance');
      }
  
      var name = registeredInstance.name;
      if (!rawType) {
          throwBindingError('type "' + name + '" must have a positive integer typeid pointer');
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
          if (options.ignoreDuplicateRegistrations) {
              return;
          } else {
              throwBindingError("Cannot register type '" + name + "' twice");
          }
      }
  
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
  
      if (awaitingDependencies.hasOwnProperty(rawType)) {
          var callbacks = awaitingDependencies[rawType];
          delete awaitingDependencies[rawType];
          callbacks.forEach(function(cb) {
              cb();
          });
      }
    }function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
      var shift = getShiftFromSize(size);
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(wt) {
              // ambiguous emscripten ABI: sometimes return values are
              // true or false, and sometimes integers (0 or 1)
              return !!wt;
          },
          'toWireType': function(destructors, o) {
              return o ? trueValue : falseValue;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': function(pointer) {
              // TODO: if heap is fixed (like in asm.js) this could be executed outside
              var heap;
              if (size === 1) {
                  heap = HEAP8;
              } else if (size === 2) {
                  heap = HEAP16;
              } else if (size === 4) {
                  heap = HEAP32;
              } else {
                  throw new TypeError("Unknown boolean type size: " + name);
              }
              return this['fromWireType'](heap[pointer >> shift]);
          },
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  
  
  function ClassHandle_isAliasOf(other) {
      if (!(this instanceof ClassHandle)) {
          return false;
      }
      if (!(other instanceof ClassHandle)) {
          return false;
      }
  
      var leftClass = this.$$.ptrType.registeredClass;
      var left = this.$$.ptr;
      var rightClass = other.$$.ptrType.registeredClass;
      var right = other.$$.ptr;
  
      while (leftClass.baseClass) {
          left = leftClass.upcast(left);
          leftClass = leftClass.baseClass;
      }
  
      while (rightClass.baseClass) {
          right = rightClass.upcast(right);
          rightClass = rightClass.baseClass;
      }
  
      return leftClass === rightClass && left === right;
    }
  
  
  function shallowCopyInternalPointer(o) {
      return {
          count: o.count,
          deleteScheduled: o.deleteScheduled,
          preservePointerOnDelete: o.preservePointerOnDelete,
          ptr: o.ptr,
          ptrType: o.ptrType,
          smartPtr: o.smartPtr,
          smartPtrType: o.smartPtrType,
      };
    }
  
  function throwInstanceAlreadyDeleted(obj) {
      function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
      }
      throwBindingError(getInstanceTypeName(obj) + ' instance already deleted');
    }
  
  
  var finalizationGroup=false;
  
  function detachFinalizer(handle) {}
  
  
  function runDestructor($$) {
      if ($$.smartPtr) {
          $$.smartPtrType.rawDestructor($$.smartPtr);
      } else {
          $$.ptrType.registeredClass.rawDestructor($$.ptr);
      }
    }function releaseClassHandle($$) {
      $$.count.value -= 1;
      var toDelete = 0 === $$.count.value;
      if (toDelete) {
          runDestructor($$);
      }
    }function attachFinalizer(handle) {
      if ('undefined' === typeof FinalizationGroup) {
          attachFinalizer = function (handle) { return handle; };
          return handle;
      }
      // If the running environment has a FinalizationGroup (see
      // https://github.com/tc39/proposal-weakrefs), then attach finalizers
      // for class handles.  We check for the presence of FinalizationGroup
      // at run-time, not build-time.
      finalizationGroup = new FinalizationGroup(function (iter) {
          for (var result = iter.next(); !result.done; result = iter.next()) {
              var $$ = result.value;
              if (!$$.ptr) {
                  console.warn('object already deleted: ' + $$.ptr);
              } else {
                  releaseClassHandle($$);
              }
          }
      });
      attachFinalizer = function(handle) {
          finalizationGroup.register(handle, handle.$$, handle.$$);
          return handle;
      };
      detachFinalizer = function(handle) {
          finalizationGroup.unregister(handle.$$);
      };
      return attachFinalizer(handle);
    }function ClassHandle_clone() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.preservePointerOnDelete) {
          this.$$.count.value += 1;
          return this;
      } else {
          var clone = attachFinalizer(Object.create(Object.getPrototypeOf(this), {
              $$: {
                  value: shallowCopyInternalPointer(this.$$),
              }
          }));
  
          clone.$$.count.value += 1;
          clone.$$.deleteScheduled = false;
          return clone;
      }
    }
  
  function ClassHandle_delete() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
  
      detachFinalizer(this);
      releaseClassHandle(this.$$);
  
      if (!this.$$.preservePointerOnDelete) {
          this.$$.smartPtr = undefined;
          this.$$.ptr = undefined;
      }
    }
  
  function ClassHandle_isDeleted() {
      return !this.$$.ptr;
    }
  
  
  var delayFunction=undefined;
  
  var deletionQueue=[];
  
  function flushPendingDeletes() {
      while (deletionQueue.length) {
          var obj = deletionQueue.pop();
          obj.$$.deleteScheduled = false;
          obj['delete']();
      }
    }function ClassHandle_deleteLater() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
      deletionQueue.push(this);
      if (deletionQueue.length === 1 && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
      this.$$.deleteScheduled = true;
      return this;
    }function init_ClassHandle() {
      ClassHandle.prototype['isAliasOf'] = ClassHandle_isAliasOf;
      ClassHandle.prototype['clone'] = ClassHandle_clone;
      ClassHandle.prototype['delete'] = ClassHandle_delete;
      ClassHandle.prototype['isDeleted'] = ClassHandle_isDeleted;
      ClassHandle.prototype['deleteLater'] = ClassHandle_deleteLater;
    }function ClassHandle() {
    }
  
  var registeredPointers={};
  
  
  function ensureOverloadTable(proto, methodName, humanName) {
      if (undefined === proto[methodName].overloadTable) {
          var prevFunc = proto[methodName];
          // Inject an overload resolver function that routes to the appropriate overload based on the number of arguments.
          proto[methodName] = function() {
              // TODO This check can be removed in -O3 level "unsafe" optimizations.
              if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
                  throwBindingError("Function '" + humanName + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + proto[methodName].overloadTable + ")!");
              }
              return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
          };
          // Move the previous function into the overload table.
          proto[methodName].overloadTable = [];
          proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    }function exposePublicSymbol(name, value, numArguments) {
      if (Module.hasOwnProperty(name)) {
          if (undefined === numArguments || (undefined !== Module[name].overloadTable && undefined !== Module[name].overloadTable[numArguments])) {
              throwBindingError("Cannot register public name '" + name + "' twice");
          }
  
          // We are exposing a function with the same name as an existing function. Create an overload table and a function selector
          // that routes between the two.
          ensureOverloadTable(Module, name, name);
          if (Module.hasOwnProperty(numArguments)) {
              throwBindingError("Cannot register multiple overloads of a function with the same number of arguments (" + numArguments + ")!");
          }
          // Add the new function into the overload table.
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          if (undefined !== numArguments) {
              Module[name].numArguments = numArguments;
          }
      }
    }
  
  function RegisteredClass(
      name,
      constructor,
      instancePrototype,
      rawDestructor,
      baseClass,
      getActualType,
      upcast,
      downcast
    ) {
      this.name = name;
      this.constructor = constructor;
      this.instancePrototype = instancePrototype;
      this.rawDestructor = rawDestructor;
      this.baseClass = baseClass;
      this.getActualType = getActualType;
      this.upcast = upcast;
      this.downcast = downcast;
      this.pureVirtualFunctions = [];
    }
  
  
  
  function upcastPointer(ptr, ptrClass, desiredClass) {
      while (ptrClass !== desiredClass) {
          if (!ptrClass.upcast) {
              throwBindingError("Expected null or instance of " + desiredClass.name + ", got an instance of " + ptrClass.name);
          }
          ptr = ptrClass.upcast(ptr);
          ptrClass = ptrClass.baseClass;
      }
      return ptr;
    }function constNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  function genericPointerToWireType(destructors, handle) {
      var ptr;
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
  
          if (this.isSmartPointer) {
              ptr = this.rawConstructor();
              if (destructors !== null) {
                  destructors.push(this.rawDestructor, ptr);
              }
              return ptr;
          } else {
              return 0;
          }
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (!this.isConst && handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
  
      if (this.isSmartPointer) {
          // TODO: this is not strictly true
          // We could support BY_EMVAL conversions from raw pointers to smart pointers
          // because the smart pointer can hold a reference to the handle
          if (undefined === handle.$$.smartPtr) {
              throwBindingError('Passing raw pointer to smart pointer is illegal');
          }
  
          switch (this.sharingPolicy) {
              case 0: // NONE
                  // no upcasting
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
                  }
                  break;
  
              case 1: // INTRUSIVE
                  ptr = handle.$$.smartPtr;
                  break;
  
              case 2: // BY_EMVAL
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      var clonedHandle = handle['clone']();
                      ptr = this.rawShare(
                          ptr,
                          __emval_register(function() {
                              clonedHandle['delete']();
                          })
                      );
                      if (destructors !== null) {
                          destructors.push(this.rawDestructor, ptr);
                      }
                  }
                  break;
  
              default:
                  throwBindingError('Unsupporting sharing policy');
          }
      }
      return ptr;
    }
  
  function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + handle.$$.ptrType.name + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  
  function simpleReadValueFromPointer(pointer) {
      return this['fromWireType'](HEAPU32[pointer >> 2]);
    }
  
  function RegisteredPointer_getPointee(ptr) {
      if (this.rawGetPointee) {
          ptr = this.rawGetPointee(ptr);
      }
      return ptr;
    }
  
  function RegisteredPointer_destructor(ptr) {
      if (this.rawDestructor) {
          this.rawDestructor(ptr);
      }
    }
  
  function RegisteredPointer_deleteObject(handle) {
      if (handle !== null) {
          handle['delete']();
      }
    }
  
  
  function downcastPointer(ptr, ptrClass, desiredClass) {
      if (ptrClass === desiredClass) {
          return ptr;
      }
      if (undefined === desiredClass.baseClass) {
          return null; // no conversion
      }
  
      var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
      if (rv === null) {
          return null;
      }
      return desiredClass.downcast(rv);
    }
  
  
  
  
  function getInheritedInstanceCount() {
      return Object.keys(registeredInstances).length;
    }
  
  function getLiveInheritedInstances() {
      var rv = [];
      for (var k in registeredInstances) {
          if (registeredInstances.hasOwnProperty(k)) {
              rv.push(registeredInstances[k]);
          }
      }
      return rv;
    }
  
  function setDelayFunction(fn) {
      delayFunction = fn;
      if (deletionQueue.length && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
    }function init_embind() {
      Module['getInheritedInstanceCount'] = getInheritedInstanceCount;
      Module['getLiveInheritedInstances'] = getLiveInheritedInstances;
      Module['flushPendingDeletes'] = flushPendingDeletes;
      Module['setDelayFunction'] = setDelayFunction;
    }var registeredInstances={};
  
  function getBasestPointer(class_, ptr) {
      if (ptr === undefined) {
          throwBindingError('ptr should not be undefined');
      }
      while (class_.baseClass) {
          ptr = class_.upcast(ptr);
          class_ = class_.baseClass;
      }
      return ptr;
    }function getInheritedInstance(class_, ptr) {
      ptr = getBasestPointer(class_, ptr);
      return registeredInstances[ptr];
    }
  
  function makeClassHandle(prototype, record) {
      if (!record.ptrType || !record.ptr) {
          throwInternalError('makeClassHandle requires ptr and ptrType');
      }
      var hasSmartPtrType = !!record.smartPtrType;
      var hasSmartPtr = !!record.smartPtr;
      if (hasSmartPtrType !== hasSmartPtr) {
          throwInternalError('Both smartPtrType and smartPtr must be specified');
      }
      record.count = { value: 1 };
      return attachFinalizer(Object.create(prototype, {
          $$: {
              value: record,
          },
      }));
    }function RegisteredPointer_fromWireType(ptr) {
      // ptr is a raw pointer (or a raw smartpointer)
  
      // rawPointer is a maybe-null raw pointer
      var rawPointer = this.getPointee(ptr);
      if (!rawPointer) {
          this.destructor(ptr);
          return null;
      }
  
      var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
      if (undefined !== registeredInstance) {
          // JS object has been neutered, time to repopulate it
          if (0 === registeredInstance.$$.count.value) {
              registeredInstance.$$.ptr = rawPointer;
              registeredInstance.$$.smartPtr = ptr;
              return registeredInstance['clone']();
          } else {
              // else, just increment reference count on existing object
              // it already has a reference to the smart pointer
              var rv = registeredInstance['clone']();
              this.destructor(ptr);
              return rv;
          }
      }
  
      function makeDefaultHandle() {
          if (this.isSmartPointer) {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this.pointeeType,
                  ptr: rawPointer,
                  smartPtrType: this,
                  smartPtr: ptr,
              });
          } else {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this,
                  ptr: ptr,
              });
          }
      }
  
      var actualType = this.registeredClass.getActualType(rawPointer);
      var registeredPointerRecord = registeredPointers[actualType];
      if (!registeredPointerRecord) {
          return makeDefaultHandle.call(this);
      }
  
      var toType;
      if (this.isConst) {
          toType = registeredPointerRecord.constPointerType;
      } else {
          toType = registeredPointerRecord.pointerType;
      }
      var dp = downcastPointer(
          rawPointer,
          this.registeredClass,
          toType.registeredClass);
      if (dp === null) {
          return makeDefaultHandle.call(this);
      }
      if (this.isSmartPointer) {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
              smartPtrType: this,
              smartPtr: ptr,
          });
      } else {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
          });
      }
    }function init_RegisteredPointer() {
      RegisteredPointer.prototype.getPointee = RegisteredPointer_getPointee;
      RegisteredPointer.prototype.destructor = RegisteredPointer_destructor;
      RegisteredPointer.prototype['argPackAdvance'] = 8;
      RegisteredPointer.prototype['readValueFromPointer'] = simpleReadValueFromPointer;
      RegisteredPointer.prototype['deleteObject'] = RegisteredPointer_deleteObject;
      RegisteredPointer.prototype['fromWireType'] = RegisteredPointer_fromWireType;
    }function RegisteredPointer(
      name,
      registeredClass,
      isReference,
      isConst,
  
      // smart pointer properties
      isSmartPointer,
      pointeeType,
      sharingPolicy,
      rawGetPointee,
      rawConstructor,
      rawShare,
      rawDestructor
    ) {
      this.name = name;
      this.registeredClass = registeredClass;
      this.isReference = isReference;
      this.isConst = isConst;
  
      // smart pointer properties
      this.isSmartPointer = isSmartPointer;
      this.pointeeType = pointeeType;
      this.sharingPolicy = sharingPolicy;
      this.rawGetPointee = rawGetPointee;
      this.rawConstructor = rawConstructor;
      this.rawShare = rawShare;
      this.rawDestructor = rawDestructor;
  
      if (!isSmartPointer && registeredClass.baseClass === undefined) {
          if (isConst) {
              this['toWireType'] = constNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          } else {
              this['toWireType'] = nonConstNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          }
      } else {
          this['toWireType'] = genericPointerToWireType;
          // Here we must leave this.destructorFunction undefined, since whether genericPointerToWireType returns
          // a pointer that needs to be freed up is runtime-dependent, and cannot be evaluated at registration time.
          // TODO: Create an alternative mechanism that allows removing the use of var destructors = []; array in
          //       craftInvokerFunction altogether.
      }
    }
  
  function replacePublicSymbol(name, value, numArguments) {
      if (!Module.hasOwnProperty(name)) {
          throwInternalError('Replacing nonexistant public symbol');
      }
      // If there's an overload table for this symbol, replace the symbol in the overload table instead.
      if (undefined !== Module[name].overloadTable && undefined !== numArguments) {
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          Module[name].argCount = numArguments;
      }
    }
  
  function embind__requireFunction(signature, rawFunction) {
      signature = readLatin1String(signature);
  
      function makeDynCaller(dynCall) {
          var args = [];
          for (var i = 1; i < signature.length; ++i) {
              args.push('a' + i);
          }
  
          var name = 'dynCall_' + signature + '_' + rawFunction;
          var body = 'return function ' + name + '(' + args.join(', ') + ') {\n';
          body    += '    return dynCall(rawFunction' + (args.length ? ', ' : '') + args.join(', ') + ');\n';
          body    += '};\n';
  
          return (new Function('dynCall', 'rawFunction', body))(dynCall, rawFunction);
      }
  
      var fp;
      if (Module['FUNCTION_TABLE_' + signature] !== undefined) {
          fp = Module['FUNCTION_TABLE_' + signature][rawFunction];
      } else if (typeof FUNCTION_TABLE !== "undefined") {
          fp = FUNCTION_TABLE[rawFunction];
      } else {
          // asm.js does not give direct access to the function tables,
          // and thus we must go through the dynCall interface which allows
          // calling into a signature's function table by pointer value.
          //
          // https://github.com/dherman/asm.js/issues/83
          //
          // This has three main penalties:
          // - dynCall is another function call in the path from JavaScript to C++.
          // - JITs may not predict through the function table indirection at runtime.
          var dc = Module['dynCall_' + signature];
          if (dc === undefined) {
              // We will always enter this branch if the signature
              // contains 'f' and PRECISE_F32 is not enabled.
              //
              // Try again, replacing 'f' with 'd'.
              dc = Module['dynCall_' + signature.replace(/f/g, 'd')];
              if (dc === undefined) {
                  throwBindingError("No dynCall invoker for signature: " + signature);
              }
          }
          fp = makeDynCaller(dc);
      }
  
      if (typeof fp !== "function") {
          throwBindingError("unknown function pointer with signature " + signature + ": " + rawFunction);
      }
      return fp;
    }
  
  
  var UnboundTypeError=undefined;
  
  function getTypeName(type) {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    }function throwUnboundTypeError(message, types) {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
          if (seen[type]) {
              return;
          }
          if (registeredTypes[type]) {
              return;
          }
          if (typeDependencies[type]) {
              typeDependencies[type].forEach(visit);
              return;
          }
          unboundTypes.push(type);
          seen[type] = true;
      }
      types.forEach(visit);
  
      throw new UnboundTypeError(message + ': ' + unboundTypes.map(getTypeName).join([', ']));
    }function __embind_register_class(
      rawType,
      rawPointerType,
      rawConstPointerType,
      baseClassRawType,
      getActualTypeSignature,
      getActualType,
      upcastSignature,
      upcast,
      downcastSignature,
      downcast,
      name,
      destructorSignature,
      rawDestructor
    ) {
      name = readLatin1String(name);
      getActualType = embind__requireFunction(getActualTypeSignature, getActualType);
      if (upcast) {
          upcast = embind__requireFunction(upcastSignature, upcast);
      }
      if (downcast) {
          downcast = embind__requireFunction(downcastSignature, downcast);
      }
      rawDestructor = embind__requireFunction(destructorSignature, rawDestructor);
      var legalFunctionName = makeLegalFunctionName(name);
  
      exposePublicSymbol(legalFunctionName, function() {
          // this code cannot run if baseClassRawType is zero
          throwUnboundTypeError('Cannot construct ' + name + ' due to unbound types', [baseClassRawType]);
      });
  
      whenDependentTypesAreResolved(
          [rawType, rawPointerType, rawConstPointerType],
          baseClassRawType ? [baseClassRawType] : [],
          function(base) {
              base = base[0];
  
              var baseClass;
              var basePrototype;
              if (baseClassRawType) {
                  baseClass = base.registeredClass;
                  basePrototype = baseClass.instancePrototype;
              } else {
                  basePrototype = ClassHandle.prototype;
              }
  
              var constructor = createNamedFunction(legalFunctionName, function() {
                  if (Object.getPrototypeOf(this) !== instancePrototype) {
                      throw new BindingError("Use 'new' to construct " + name);
                  }
                  if (undefined === registeredClass.constructor_body) {
                      throw new BindingError(name + " has no accessible constructor");
                  }
                  var body = registeredClass.constructor_body[arguments.length];
                  if (undefined === body) {
                      throw new BindingError("Tried to invoke ctor of " + name + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(registeredClass.constructor_body).toString() + ") parameters instead!");
                  }
                  return body.apply(this, arguments);
              });
  
              var instancePrototype = Object.create(basePrototype, {
                  constructor: { value: constructor },
              });
  
              constructor.prototype = instancePrototype;
  
              var registeredClass = new RegisteredClass(
                  name,
                  constructor,
                  instancePrototype,
                  rawDestructor,
                  baseClass,
                  getActualType,
                  upcast,
                  downcast);
  
              var referenceConverter = new RegisteredPointer(
                  name,
                  registeredClass,
                  true,
                  false,
                  false);
  
              var pointerConverter = new RegisteredPointer(
                  name + '*',
                  registeredClass,
                  false,
                  false,
                  false);
  
              var constPointerConverter = new RegisteredPointer(
                  name + ' const*',
                  registeredClass,
                  false,
                  true,
                  false);
  
              registeredPointers[rawType] = {
                  pointerType: pointerConverter,
                  constPointerType: constPointerConverter
              };
  
              replacePublicSymbol(legalFunctionName, constructor);
  
              return [referenceConverter, pointerConverter, constPointerConverter];
          }
      );
    }

  
  function heap32VectorToArray(count, firstElement) {
      var array = [];
      for (var i = 0; i < count; i++) {
          array.push(HEAP32[(firstElement >> 2) + i]);
      }
      return array;
    }
  
  function runDestructors(destructors) {
      while (destructors.length) {
          var ptr = destructors.pop();
          var del = destructors.pop();
          del(ptr);
      }
    }function __embind_register_class_constructor(
      rawClassType,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      invoker,
      rawConstructor
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      invoker = embind__requireFunction(invokerSignature, invoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = 'constructor ' + classType.name;
  
          if (undefined === classType.registeredClass.constructor_body) {
              classType.registeredClass.constructor_body = [];
          }
          if (undefined !== classType.registeredClass.constructor_body[argCount - 1]) {
              throw new BindingError("Cannot register multiple constructors with identical number of parameters (" + (argCount-1) + ") for class '" + classType.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
          }
          classType.registeredClass.constructor_body[argCount - 1] = function unboundTypeHandler() {
              throwUnboundTypeError('Cannot construct ' + classType.name + ' due to unbound types', rawArgTypes);
          };
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
              classType.registeredClass.constructor_body[argCount - 1] = function constructor_body() {
                  if (arguments.length !== argCount - 1) {
                      throwBindingError(humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argCount-1));
                  }
                  var destructors = [];
                  var args = new Array(argCount);
                  args[0] = rawConstructor;
                  for (var i = 1; i < argCount; ++i) {
                      args[i] = argTypes[i]['toWireType'](destructors, arguments[i - 1]);
                  }
  
                  var ptr = invoker.apply(null, args);
                  runDestructors(destructors);
  
                  return argTypes[0]['fromWireType'](ptr);
              };
              return [];
          });
          return [];
      });
    }

  
  
  var emval_free_list=[];
  
  var emval_handle_array=[{},{value:undefined},{value:null},{value:true},{value:false}];function __emval_decref(handle) {
      if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
          emval_handle_array[handle] = undefined;
          emval_free_list.push(handle);
      }
    }
  
  
  
  function count_emval_handles() {
      var count = 0;
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              ++count;
          }
      }
      return count;
    }
  
  function get_first_emval() {
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              return emval_handle_array[i];
          }
      }
      return null;
    }function init_emval() {
      Module['count_emval_handles'] = count_emval_handles;
      Module['get_first_emval'] = get_first_emval;
    }function __emval_register(value) {
  
      switch(value){
        case undefined :{ return 1; }
        case null :{ return 2; }
        case true :{ return 3; }
        case false :{ return 4; }
        default:{
          var handle = emval_free_list.length ?
              emval_free_list.pop() :
              emval_handle_array.length;
  
          emval_handle_array[handle] = {refcount: 1, value: value};
          return handle;
          }
        }
    }function __embind_register_emval(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(handle) {
              var rv = emval_handle_array[handle].value;
              __emval_decref(handle);
              return rv;
          },
          'toWireType': function(destructors, value) {
              return __emval_register(value);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: null, // This type does not need a destructor
  
          // TODO: do we need a deleteObject here?  write a test where
          // emval is passed into JS via an interface
      });
    }

  
  function _embind_repr(v) {
      if (v === null) {
          return 'null';
      }
      var t = typeof v;
      if (t === 'object' || t === 'array' || t === 'function') {
          return v.toString();
      } else {
          return '' + v;
      }
    }
  
  function floatReadValueFromPointer(name, shift) {
      switch (shift) {
          case 2: return function(pointer) {
              return this['fromWireType'](HEAPF32[pointer >> 2]);
          };
          case 3: return function(pointer) {
              return this['fromWireType'](HEAPF64[pointer >> 3]);
          };
          default:
              throw new TypeError("Unknown float type: " + name);
      }
    }function __embind_register_float(rawType, name, size) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              return value;
          },
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following if() and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              return value;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': floatReadValueFromPointer(name, shift),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  
  function new_(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
          throw new TypeError('new_ called with constructor type ' + typeof(constructor) + " which is not a function");
      }
  
      /*
       * Previously, the following line was just:
  
       function dummy() {};
  
       * Unfortunately, Chrome was preserving 'dummy' as the object's name, even though at creation, the 'dummy' has the
       * correct constructor name.  Thus, objects created with IMVU.new would show up in the debugger as 'dummy', which
       * isn't very helpful.  Using IMVU.createNamedFunction addresses the issue.  Doublely-unfortunately, there's no way
       * to write a test for this behavior.  -NRD 2013.02.22
       */
      var dummy = createNamedFunction(constructor.name || 'unknownFunctionName', function(){});
      dummy.prototype = constructor.prototype;
      var obj = new dummy;
  
      var r = constructor.apply(obj, argumentList);
      return (r instanceof Object) ? r : obj;
    }function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
      // humanName: a human-readable string name for the function to be generated.
      // argTypes: An array that contains the embind type objects for all types in the function signature.
      //    argTypes[0] is the type object for the function return value.
      //    argTypes[1] is the type object for function this object/class type, or null if not crafting an invoker for a class method.
      //    argTypes[2...] are the actual function parameters.
      // classType: The embind type object for the class to be bound, or null if this is not a method of a class.
      // cppInvokerFunc: JS Function object to the C++-side function that interops into C++ code.
      // cppTargetFunc: Function pointer (an integer to FUNCTION_TABLE) to the target C++ function the cppInvokerFunc will end up calling.
      var argCount = argTypes.length;
  
      if (argCount < 2) {
          throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
      }
  
      var isClassMethodFunc = (argTypes[1] !== null && classType !== null);
  
      // Free functions with signature "void function()" do not need an invoker that marshalls between wire types.
  // TODO: This omits argument count check - enable only at -O3 or similar.
  //    if (ENABLE_UNSAFE_OPTS && argCount == 2 && argTypes[0].name == "void" && !isClassMethodFunc) {
  //       return FUNCTION_TABLE[fn];
  //    }
  
  
      // Determine if we need to use a dynamic stack to store the destructors for the function parameters.
      // TODO: Remove this completely once all function invokers are being dynamically generated.
      var needsDestructorStack = false;
  
      for(var i = 1; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here.
          if (argTypes[i] !== null && argTypes[i].destructorFunction === undefined) { // The type does not define a destructor function - must use dynamic stack
              needsDestructorStack = true;
              break;
          }
      }
  
      var returns = (argTypes[0].name !== "void");
  
      var argsList = "";
      var argsListWired = "";
      for(var i = 0; i < argCount - 2; ++i) {
          argsList += (i!==0?", ":"")+"arg"+i;
          argsListWired += (i!==0?", ":"")+"arg"+i+"Wired";
      }
  
      var invokerFnBody =
          "return function "+makeLegalFunctionName(humanName)+"("+argsList+") {\n" +
          "if (arguments.length !== "+(argCount - 2)+") {\n" +
              "throwBindingError('function "+humanName+" called with ' + arguments.length + ' arguments, expected "+(argCount - 2)+" args!');\n" +
          "}\n";
  
  
      if (needsDestructorStack) {
          invokerFnBody +=
              "var destructors = [];\n";
      }
  
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = ["throwBindingError", "invoker", "fn", "runDestructors", "retType", "classParam"];
      var args2 = [throwBindingError, cppInvokerFunc, cppTargetFunc, runDestructors, argTypes[0], argTypes[1]];
  
  
      if (isClassMethodFunc) {
          invokerFnBody += "var thisWired = classParam.toWireType("+dtorStack+", this);\n";
      }
  
      for(var i = 0; i < argCount - 2; ++i) {
          invokerFnBody += "var arg"+i+"Wired = argType"+i+".toWireType("+dtorStack+", arg"+i+"); // "+argTypes[i+2].name+"\n";
          args1.push("argType"+i);
          args2.push(argTypes[i+2]);
      }
  
      if (isClassMethodFunc) {
          argsListWired = "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
      }
  
      invokerFnBody +=
          (returns?"var rv = ":"") + "invoker(fn"+(argsListWired.length>0?", ":"")+argsListWired+");\n";
  
      if (needsDestructorStack) {
          invokerFnBody += "runDestructors(destructors);\n";
      } else {
          for(var i = isClassMethodFunc?1:2; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here. Also skip class type if not a method.
              var paramName = (i === 1 ? "thisWired" : ("arg"+(i - 2)+"Wired"));
              if (argTypes[i].destructorFunction !== null) {
                  invokerFnBody += paramName+"_dtor("+paramName+"); // "+argTypes[i].name+"\n";
                  args1.push(paramName+"_dtor");
                  args2.push(argTypes[i].destructorFunction);
              }
          }
      }
  
      if (returns) {
          invokerFnBody += "var ret = retType.fromWireType(rv);\n" +
                           "return ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
  
      args1.push(invokerFnBody);
  
      var invokerFunction = new_(Function, args1).apply(null, args2);
      return invokerFunction;
    }function __embind_register_function(name, argCount, rawArgTypesAddr, signature, rawInvoker, fn) {
      var argTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      name = readLatin1String(name);
  
      rawInvoker = embind__requireFunction(signature, rawInvoker);
  
      exposePublicSymbol(name, function() {
          throwUnboundTypeError('Cannot call ' + name + ' due to unbound types', argTypes);
      }, argCount - 1);
  
      whenDependentTypesAreResolved([], argTypes, function(argTypes) {
          var invokerArgsArray = [argTypes[0] /* return value */, null /* no class 'this'*/].concat(argTypes.slice(1) /* actual params */);
          replacePublicSymbol(name, craftInvokerFunction(name, invokerArgsArray, null /* no class 'this'*/, rawInvoker, fn), argCount - 1);
          return [];
      });
    }

  
  function integerReadValueFromPointer(name, shift, signed) {
      // integers are quite common, so generate very specialized functions
      switch (shift) {
          case 0: return signed ?
              function readS8FromPointer(pointer) { return HEAP8[pointer]; } :
              function readU8FromPointer(pointer) { return HEAPU8[pointer]; };
          case 1: return signed ?
              function readS16FromPointer(pointer) { return HEAP16[pointer >> 1]; } :
              function readU16FromPointer(pointer) { return HEAPU16[pointer >> 1]; };
          case 2: return signed ?
              function readS32FromPointer(pointer) { return HEAP32[pointer >> 2]; } :
              function readU32FromPointer(pointer) { return HEAPU32[pointer >> 2]; };
          default:
              throw new TypeError("Unknown integer type: " + name);
      }
    }function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
      name = readLatin1String(name);
      if (maxRange === -1) { // LLVM doesn't have signed and unsigned 32-bit types, so u32 literals come out as 'i32 -1'. Always treat those as max u32.
          maxRange = 4294967295;
      }
  
      var shift = getShiftFromSize(size);
  
      var fromWireType = function(value) {
          return value;
      };
  
      if (minRange === 0) {
          var bitshift = 32 - 8*size;
          fromWireType = function(value) {
              return (value << bitshift) >>> bitshift;
          };
      }
  
      var isUnsignedType = (name.indexOf('unsigned') != -1);
  
      registerType(primitiveType, {
          name: name,
          'fromWireType': fromWireType,
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following two if()s and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              if (value < minRange || value > maxRange) {
                  throw new TypeError('Passing a number "' + _embind_repr(value) + '" from JS side to C/C++ side to an argument of type "' + name + '", which is outside the valid range [' + minRange + ', ' + maxRange + ']!');
              }
              return isUnsignedType ? (value >>> 0) : (value | 0);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': integerReadValueFromPointer(name, shift, minRange !== 0),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      var typeMapping = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
      ];
  
      var TA = typeMapping[dataTypeIndex];
  
      function decodeMemoryView(handle) {
          handle = handle >> 2;
          var heap = HEAPU32;
          var size = heap[handle]; // in elements
          var data = heap[handle + 1]; // byte offset into emscripten heap
          return new TA(heap['buffer'], data, size);
      }
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': decodeMemoryView,
          'argPackAdvance': 8,
          'readValueFromPointer': decodeMemoryView,
      }, {
          ignoreDuplicateRegistrations: true,
      });
    }

  function __embind_register_std_string(rawType, name) {
      name = readLatin1String(name);
      var stdStringIsUTF8
      //process only std::string bindings with UTF8 support, in contrast to e.g. std::basic_string<unsigned char>
      = (name === "std::string");
  
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var length = HEAPU32[value >> 2];
  
              var str;
              if(stdStringIsUTF8) {
                  //ensure null termination at one-past-end byte if not present yet
                  var endChar = HEAPU8[value + 4 + length];
                  var endCharSwap = 0;
                  if(endChar != 0)
                  {
                    endCharSwap = endChar;
                    HEAPU8[value + 4 + length] = 0;
                  }
  
                  var decodeStartPtr = value + 4;
                  //looping here to support possible embedded '0' bytes
                  for (var i = 0; i <= length; ++i) {
                    var currentBytePtr = value + 4 + i;
                    if(HEAPU8[currentBytePtr] == 0)
                    {
                      var stringSegment = UTF8ToString(decodeStartPtr);
                      if(str === undefined)
                        str = stringSegment;
                      else
                      {
                        str += String.fromCharCode(0);
                        str += stringSegment;
                      }
                      decodeStartPtr = currentBytePtr + 1;
                    }
                  }
  
                  if(endCharSwap != 0)
                    HEAPU8[value + 4 + length] = endCharSwap;
              } else {
                  var a = new Array(length);
                  for (var i = 0; i < length; ++i) {
                      a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
                  }
                  str = a.join('');
              }
  
              _free(value);
              
              return str;
          },
          'toWireType': function(destructors, value) {
              if (value instanceof ArrayBuffer) {
                  value = new Uint8Array(value);
              }
              
              var getLength;
              var valueIsOfTypeString = (typeof value === 'string');
  
              if (!(valueIsOfTypeString || value instanceof Uint8Array || value instanceof Uint8ClampedArray || value instanceof Int8Array)) {
                  throwBindingError('Cannot pass non-string to std::string');
              }
              if (stdStringIsUTF8 && valueIsOfTypeString) {
                  getLength = function() {return lengthBytesUTF8(value);};
              } else {
                  getLength = function() {return value.length;};
              }
              
              // assumes 4-byte alignment
              var length = getLength();
              var ptr = _malloc(4 + length + 1);
              HEAPU32[ptr >> 2] = length;
  
              if (stdStringIsUTF8 && valueIsOfTypeString) {
                  stringToUTF8(value, ptr + 4, length + 1);
              } else {
                  if(valueIsOfTypeString) {
                      for (var i = 0; i < length; ++i) {
                          var charCode = value.charCodeAt(i);
                          if (charCode > 255) {
                              _free(ptr);
                              throwBindingError('String has UTF-16 code units that do not fit in 8 bits');
                          }
                          HEAPU8[ptr + 4 + i] = charCode;
                      }
                  } else {
                      for (var i = 0; i < length; ++i) {
                          HEAPU8[ptr + 4 + i] = value[i];
                      }
                  }
              }
  
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function __embind_register_std_wstring(rawType, charSize, name) {
      // nb. do not cache HEAPU16 and HEAPU32, they may be destroyed by emscripten_resize_heap().
      name = readLatin1String(name);
      var getHeap, shift;
      if (charSize === 2) {
          getHeap = function() { return HEAPU16; };
          shift = 1;
      } else if (charSize === 4) {
          getHeap = function() { return HEAPU32; };
          shift = 2;
      }
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var HEAP = getHeap();
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              var start = (value + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAP[start + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              // assumes 4-byte alignment
              var length = value.length;
              var ptr = _malloc(4 + length * charSize);
              var HEAP = getHeap();
              HEAPU32[ptr >> 2] = length;
              var start = (ptr + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  HEAP[start + i] = value.charCodeAt(i);
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function __embind_register_void(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          isVoid: true, // void return values can be optimized out sometimes
          name: name,
          'argPackAdvance': 0,
          'fromWireType': function() {
              return undefined;
          },
          'toWireType': function(destructors, o) {
              // TODO: assert if anything else is given?
              return undefined;
          },
      });
    }

  function _emscripten_get_heap_size() {
      return HEAP8.length;
    }

   

  
  function abortOnCannotGrowMemory(requestedSize) {
      abort('OOM');
    }function _emscripten_resize_heap(requestedSize) {
      abortOnCannotGrowMemory(requestedSize);
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
    }
  
   

   
embind_init_charCodes();
BindingError = Module['BindingError'] = extendError(Error, 'BindingError');;
InternalError = Module['InternalError'] = extendError(Error, 'InternalError');;
init_ClassHandle();
init_RegisteredPointer();
init_embind();;
UnboundTypeError = Module['UnboundTypeError'] = extendError(Error, 'UnboundTypeError');;
init_emval();;
var ASSERTIONS = false;

// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

/**
 * Decodes a base64 string.
 * @param {String} input The string to decode.
 */
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
  var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf;
    try {
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0 ; i < decoded.length ; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}


// ASM_LIBRARY EXTERN PRIMITIVES: Int8Array,Int32Array


var asmGlobalArg = { "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array };

var asmLibraryArg = { "$": getLiveInheritedInstances, "A": __emval_decref, "B": __emval_register, "C": _embind_repr, "D": _emscripten_get_heap_size, "E": _emscripten_memcpy_big, "F": _emscripten_resize_heap, "G": abortOnCannotGrowMemory, "H": attachFinalizer, "I": constNoSmartPtrRawPointerToWireType, "J": count_emval_handles, "K": craftInvokerFunction, "L": createNamedFunction, "M": demangle, "N": demangleAll, "O": detachFinalizer, "P": downcastPointer, "Q": embind__requireFunction, "R": embind_init_charCodes, "S": ensureOverloadTable, "T": exposePublicSymbol, "U": extendError, "V": floatReadValueFromPointer, "W": flushPendingDeletes, "X": genericPointerToWireType, "Y": getBasestPointer, "Z": getInheritedInstance, "_": getInheritedInstanceCount, "a": abort, "aA": throwInternalError, "aB": throwUnboundTypeError, "aC": upcastPointer, "aD": whenDependentTypesAreResolved, "aE": tempDoublePtr, "aa": getShiftFromSize, "ab": getTypeName, "ac": get_first_emval, "ad": heap32VectorToArray, "ae": init_ClassHandle, "af": init_RegisteredPointer, "ag": init_embind, "ah": init_emval, "ai": integerReadValueFromPointer, "aj": jsStackTrace, "ak": makeClassHandle, "al": makeLegalFunctionName, "am": new_, "an": nonConstNoSmartPtrRawPointerToWireType, "ao": readLatin1String, "ap": registerType, "aq": releaseClassHandle, "ar": replacePublicSymbol, "as": runDestructor, "at": runDestructors, "au": setDelayFunction, "av": shallowCopyInternalPointer, "aw": simpleReadValueFromPointer, "ax": stackTrace, "ay": throwBindingError, "az": throwInstanceAlreadyDeleted, "b": setTempRet0, "c": getTempRet0, "d": ClassHandle, "e": ClassHandle_clone, "f": ClassHandle_delete, "g": ClassHandle_deleteLater, "h": ClassHandle_isAliasOf, "i": ClassHandle_isDeleted, "j": RegisteredClass, "k": RegisteredPointer, "l": RegisteredPointer_deleteObject, "m": RegisteredPointer_destructor, "n": RegisteredPointer_fromWireType, "o": RegisteredPointer_getPointee, "p": __embind_register_bool, "q": __embind_register_class, "r": __embind_register_class_constructor, "s": __embind_register_emval, "t": __embind_register_float, "u": __embind_register_function, "v": __embind_register_integer, "w": __embind_register_memory_view, "x": __embind_register_std_string, "y": __embind_register_std_wstring, "z": __embind_register_void };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'use asm';

  var HEAP8 = new global.Int8Array(buffer),
  HEAP16 = new global.Int16Array(buffer),
  HEAP32 = new global.Int32Array(buffer),
  HEAPU8 = new global.Uint8Array(buffer),
  HEAPU16 = new global.Uint16Array(buffer),
  tempDoublePtr=env.aE|0,
  __THREW__ = 0,
  threwValue = 0,
  setjmpId = 0,
  tempInt = 0,
  tempBigInt = 0,
  tempBigIntS = 0,
  tempValue = 0,
  tempDouble = 0.0,
  abort=env.a,
  setTempRet0=env.b,
  getTempRet0=env.c,
  ClassHandle=env.d,
  ClassHandle_clone=env.e,
  ClassHandle_delete=env.f,
  ClassHandle_deleteLater=env.g,
  ClassHandle_isAliasOf=env.h,
  ClassHandle_isDeleted=env.i,
  RegisteredClass=env.j,
  RegisteredPointer=env.k,
  RegisteredPointer_deleteObject=env.l,
  RegisteredPointer_destructor=env.m,
  RegisteredPointer_fromWireType=env.n,
  RegisteredPointer_getPointee=env.o,
  __embind_register_bool=env.p,
  __embind_register_class=env.q,
  __embind_register_class_constructor=env.r,
  __embind_register_emval=env.s,
  __embind_register_float=env.t,
  __embind_register_function=env.u,
  __embind_register_integer=env.v,
  __embind_register_memory_view=env.w,
  __embind_register_std_string=env.x,
  __embind_register_std_wstring=env.y,
  __embind_register_void=env.z,
  __emval_decref=env.A,
  __emval_register=env.B,
  _embind_repr=env.C,
  _emscripten_get_heap_size=env.D,
  _emscripten_memcpy_big=env.E,
  _emscripten_resize_heap=env.F,
  abortOnCannotGrowMemory=env.G,
  attachFinalizer=env.H,
  constNoSmartPtrRawPointerToWireType=env.I,
  count_emval_handles=env.J,
  craftInvokerFunction=env.K,
  createNamedFunction=env.L,
  demangle=env.M,
  demangleAll=env.N,
  detachFinalizer=env.O,
  downcastPointer=env.P,
  embind__requireFunction=env.Q,
  embind_init_charCodes=env.R,
  ensureOverloadTable=env.S,
  exposePublicSymbol=env.T,
  extendError=env.U,
  floatReadValueFromPointer=env.V,
  flushPendingDeletes=env.W,
  genericPointerToWireType=env.X,
  getBasestPointer=env.Y,
  getInheritedInstance=env.Z,
  getInheritedInstanceCount=env._,
  getLiveInheritedInstances=env.$,
  getShiftFromSize=env.aa,
  getTypeName=env.ab,
  get_first_emval=env.ac,
  heap32VectorToArray=env.ad,
  init_ClassHandle=env.ae,
  init_RegisteredPointer=env.af,
  init_embind=env.ag,
  init_emval=env.ah,
  integerReadValueFromPointer=env.ai,
  jsStackTrace=env.aj,
  makeClassHandle=env.ak,
  makeLegalFunctionName=env.al,
  new_=env.am,
  nonConstNoSmartPtrRawPointerToWireType=env.an,
  readLatin1String=env.ao,
  registerType=env.ap,
  releaseClassHandle=env.aq,
  replacePublicSymbol=env.ar,
  runDestructor=env.as,
  runDestructors=env.at,
  setDelayFunction=env.au,
  shallowCopyInternalPointer=env.av,
  simpleReadValueFromPointer=env.aw,
  stackTrace=env.ax,
  throwBindingError=env.ay,
  throwInstanceAlreadyDeleted=env.az,
  throwInternalError=env.aA,
  throwUnboundTypeError=env.aB,
  upcastPointer=env.aC,
  whenDependentTypesAreResolved=env.aD,
  STACKTOP = 3504,
  STACK_MAX = 5246384,
  tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS
  function globalCtors() {
    __GLOBAL__sub_I_chp_cpp();
    __GLOBAL__sub_I_bind_cpp();
  }
function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  
  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function __Z4cnotR6QStatell($q,$b,$c) {
 $q = $q|0;
 $b = $b|0;
 $c = $c|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var $add = 0, $add72 = 0, $and = 0, $and11 = 0, $and2 = 0, $and22 = 0, $and27 = 0, $and33 = 0, $and39 = 0, $and5 = 0, $and55 = 0, $and61 = 0, $and67 = 0, $arrayidx = 0, $arrayidx10 = 0, $arrayidx16 = 0, $arrayidx32 = 0, $arrayidx38 = 0, $arrayidx4 = 0, $arrayidx42 = 0;
 var $arrayidx60 = 0, $arrayidx66 = 0, $arrayidx71 = 0, $arrayidx8 = 0, $arrayidx9 = 0, $cmp = 0, $cmp62 = 0, $i$063 = 0, $inc = 0, $mul = 0, $r = 0, $rem = 0, $rem73 = 0, $shl = 0, $shl3 = 0, $shr = 0, $shr1 = 0, $tobool = 0, $tobool12 = 0, $tobool23 = 0;
 var $tobool28 = 0, $tobool34 = 0, $tobool40 = 0, $tobool56 = 0, $tobool62 = 0, $tobool68 = 0, $x = 0, $xor = 0, $xor17 = 0, $z = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shr = $b >> 5;
 $shr1 = $c >> 5;
 $and = $b & 31;
 $shl = 1 << $and;
 $and2 = $c & 31;
 $shl3 = 1 << $and2;
 $0 = HEAP32[$q>>2]|0;
 $cmp62 = ($0|0)>(0);
 if (!($cmp62)) {
  return;
 }
 $x = ((($q)) + 4|0);
 $1 = HEAP32[$x>>2]|0;
 $z = ((($q)) + 8|0);
 $2 = HEAP32[$z>>2]|0;
 $r = ((($q)) + 12|0);
 $3 = HEAP32[$r>>2]|0;
 $i$063 = 0;
 while(1) {
  $arrayidx = (($1) + ($i$063<<2)|0);
  $4 = HEAP32[$arrayidx>>2]|0;
  $arrayidx4 = (($4) + ($shr<<2)|0);
  $5 = HEAP32[$arrayidx4>>2]|0;
  $and5 = $5 & $shl;
  $tobool = ($and5|0)==(0);
  $arrayidx8 = (($4) + ($shr1<<2)|0);
  if (!($tobool)) {
   $6 = HEAP32[$arrayidx8>>2]|0;
   $xor = $6 ^ $shl3;
   HEAP32[$arrayidx8>>2] = $xor;
  }
  $arrayidx9 = (($2) + ($i$063<<2)|0);
  $7 = HEAP32[$arrayidx9>>2]|0;
  $arrayidx10 = (($7) + ($shr1<<2)|0);
  $8 = HEAP32[$arrayidx10>>2]|0;
  $and11 = $8 & $shl3;
  $tobool12 = ($and11|0)==(0);
  $arrayidx16 = (($7) + ($shr<<2)|0);
  if (!($tobool12)) {
   $9 = HEAP32[$arrayidx16>>2]|0;
   $xor17 = $9 ^ $shl;
   HEAP32[$arrayidx16>>2] = $xor17;
  }
  $10 = HEAP32[$arrayidx4>>2]|0;
  $and22 = $10 & $shl;
  $tobool23 = ($and22|0)==(0);
  if (!($tobool23)) {
   $11 = HEAP32[$arrayidx10>>2]|0;
   $and27 = $11 & $shl3;
   $tobool28 = ($and27|0)==(0);
   if (!($tobool28)) {
    $arrayidx32 = (($4) + ($shr1<<2)|0);
    $12 = HEAP32[$arrayidx32>>2]|0;
    $and33 = $12 & $shl3;
    $tobool34 = ($and33|0)==(0);
    if (!($tobool34)) {
     $arrayidx38 = (($7) + ($shr<<2)|0);
     $13 = HEAP32[$arrayidx38>>2]|0;
     $and39 = $13 & $shl;
     $tobool40 = ($and39|0)==(0);
     if (!($tobool40)) {
      $arrayidx42 = (($3) + ($i$063<<2)|0);
      $14 = HEAP32[$arrayidx42>>2]|0;
      $add = (($14) + 2)|0;
      $rem = (($add|0) % 4)&-1;
      HEAP32[$arrayidx42>>2] = $rem;
     }
    }
   }
   $15 = HEAP32[$arrayidx10>>2]|0;
   $and55 = $15 & $shl3;
   $tobool56 = ($and55|0)==(0);
   if (!($tobool56)) {
    $arrayidx60 = (($4) + ($shr1<<2)|0);
    $16 = HEAP32[$arrayidx60>>2]|0;
    $and61 = $16 & $shl3;
    $tobool62 = ($and61|0)==(0);
    if ($tobool62) {
     $arrayidx66 = (($7) + ($shr<<2)|0);
     $17 = HEAP32[$arrayidx66>>2]|0;
     $and67 = $17 & $shl;
     $tobool68 = ($and67|0)==(0);
     if ($tobool68) {
      $arrayidx71 = (($3) + ($i$063<<2)|0);
      $18 = HEAP32[$arrayidx71>>2]|0;
      $add72 = (($18) + 2)|0;
      $rem73 = (($add72|0) % 4)&-1;
      HEAP32[$arrayidx71>>2] = $rem73;
     }
    }
   }
  }
  $inc = (($i$063) + 1)|0;
  $19 = HEAP32[$q>>2]|0;
  $mul = $19 << 1;
  $cmp = ($inc|0)<($mul|0);
  if ($cmp) {
   $i$063 = $inc;
  } else {
   break;
  }
 }
 return;
}
function __Z8hadamardR6QStatel($q,$b) {
 $q = $q|0;
 $b = $b|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $and = 0, $and16 = 0, $and24 = 0, $and28 = 0, $and7 = 0, $arrayidx = 0, $arrayidx1 = 0;
 var $arrayidx30 = 0, $arrayidx5 = 0, $arrayidx6 = 0, $cmp = 0, $cmp38 = 0, $i$039 = 0, $inc = 0, $mul = 0, $or$cond = 0, $r = 0, $rem = 0, $shl = 0, $shr = 0, $tobool = 0, $tobool29 = 0, $x = 0, $xor = 0, $xor11 = 0, $xor15 = 0, $xor20 = 0;
 var $z = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shr = $b >> 5;
 $and = $b & 31;
 $shl = 1 << $and;
 $0 = HEAP32[$q>>2]|0;
 $cmp38 = ($0|0)>(0);
 if (!($cmp38)) {
  return;
 }
 $x = ((($q)) + 4|0);
 $1 = HEAP32[$x>>2]|0;
 $z = ((($q)) + 8|0);
 $2 = HEAP32[$z>>2]|0;
 $r = ((($q)) + 12|0);
 $3 = HEAP32[$r>>2]|0;
 $i$039 = 0;
 while(1) {
  $arrayidx = (($1) + ($i$039<<2)|0);
  $4 = HEAP32[$arrayidx>>2]|0;
  $arrayidx1 = (($4) + ($shr<<2)|0);
  $5 = HEAP32[$arrayidx1>>2]|0;
  $arrayidx5 = (($2) + ($i$039<<2)|0);
  $6 = HEAP32[$arrayidx5>>2]|0;
  $arrayidx6 = (($6) + ($shr<<2)|0);
  $7 = HEAP32[$arrayidx6>>2]|0;
  $xor = $7 ^ $5;
  $and7 = $xor & $shl;
  $xor11 = $and7 ^ $5;
  HEAP32[$arrayidx1>>2] = $xor11;
  $8 = HEAP32[$arrayidx6>>2]|0;
  $xor15 = $8 ^ $5;
  $and16 = $xor15 & $shl;
  $xor20 = $and16 ^ $8;
  HEAP32[$arrayidx6>>2] = $xor20;
  $9 = HEAP32[$arrayidx1>>2]|0;
  $and24 = $9 & $shl;
  $tobool = ($and24|0)==(0);
  $and28 = $xor20 & $shl;
  $tobool29 = ($and28|0)==(0);
  $or$cond = $tobool | $tobool29;
  if (!($or$cond)) {
   $arrayidx30 = (($3) + ($i$039<<2)|0);
   $10 = HEAP32[$arrayidx30>>2]|0;
   $add = (($10) + 2)|0;
   $rem = (($add|0) % 4)&-1;
   HEAP32[$arrayidx30>>2] = $rem;
  }
  $inc = (($i$039) + 1)|0;
  $11 = HEAP32[$q>>2]|0;
  $mul = $11 << 1;
  $cmp = ($inc|0)<($mul|0);
  if ($cmp) {
   $i$039 = $inc;
  } else {
   break;
  }
 }
 return;
}
function __Z5phaseR6QStatel($q,$b) {
 $q = $q|0;
 $b = $b|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $and = 0, $and2 = 0, $and5 = 0, $arrayidx = 0, $arrayidx1 = 0, $arrayidx15 = 0, $arrayidx16 = 0;
 var $arrayidx3 = 0, $arrayidx4 = 0, $arrayidx7 = 0, $cmp = 0, $cmp24 = 0, $i$025 = 0, $inc = 0, $mul = 0, $r = 0, $rem = 0, $shl = 0, $shr = 0, $tobool = 0, $tobool6 = 0, $x = 0, $xor = 0, $z14 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shr = $b >> 5;
 $and = $b & 31;
 $shl = 1 << $and;
 $0 = HEAP32[$q>>2]|0;
 $cmp24 = ($0|0)>(0);
 if (!($cmp24)) {
  return;
 }
 $x = ((($q)) + 4|0);
 $1 = HEAP32[$x>>2]|0;
 $z14 = ((($q)) + 8|0);
 $2 = HEAP32[$z14>>2]|0;
 $r = ((($q)) + 12|0);
 $3 = HEAP32[$r>>2]|0;
 $i$025 = 0;
 while(1) {
  $arrayidx = (($1) + ($i$025<<2)|0);
  $4 = HEAP32[$arrayidx>>2]|0;
  $arrayidx1 = (($4) + ($shr<<2)|0);
  $5 = HEAP32[$arrayidx1>>2]|0;
  $and2 = $5 & $shl;
  $tobool = ($and2|0)==(0);
  if (!($tobool)) {
   $arrayidx3 = (($2) + ($i$025<<2)|0);
   $6 = HEAP32[$arrayidx3>>2]|0;
   $arrayidx4 = (($6) + ($shr<<2)|0);
   $7 = HEAP32[$arrayidx4>>2]|0;
   $and5 = $7 & $shl;
   $tobool6 = ($and5|0)==(0);
   if (!($tobool6)) {
    $arrayidx7 = (($3) + ($i$025<<2)|0);
    $8 = HEAP32[$arrayidx7>>2]|0;
    $add = (($8) + 2)|0;
    $rem = (($add|0) % 4)&-1;
    HEAP32[$arrayidx7>>2] = $rem;
   }
  }
  $arrayidx15 = (($2) + ($i$025<<2)|0);
  $9 = HEAP32[$arrayidx15>>2]|0;
  $arrayidx16 = (($9) + ($shr<<2)|0);
  $10 = HEAP32[$arrayidx16>>2]|0;
  $xor = $10 ^ $and2;
  HEAP32[$arrayidx16>>2] = $xor;
  $inc = (($i$025) + 1)|0;
  $11 = HEAP32[$q>>2]|0;
  $mul = $11 << 1;
  $cmp = ($inc|0)<($mul|0);
  if ($cmp) {
   $i$025 = $inc;
  } else {
   break;
  }
 }
 return;
}
function __Z7rowcopyR6QStatell($q,$i,$k) {
 $q = $q|0;
 $i = $i|0;
 $k = $k|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $arrayidx = 0, $arrayidx1 = 0, $arrayidx10 = 0, $arrayidx12 = 0, $arrayidx3 = 0, $arrayidx4 = 0, $arrayidx5 = 0, $arrayidx6 = 0;
 var $arrayidx8 = 0, $arrayidx9 = 0, $cmp = 0, $cmp16 = 0, $inc = 0, $j$017 = 0, $over32 = 0, $r = 0, $x = 0, $z = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $over32 = ((($q)) + 16|0);
 $0 = HEAP32[$over32>>2]|0;
 $cmp16 = ($0|0)>(0);
 if (!($cmp16)) {
  $r = ((($q)) + 12|0);
  $10 = HEAP32[$r>>2]|0;
  $arrayidx10 = (($10) + ($k<<2)|0);
  $11 = HEAP32[$arrayidx10>>2]|0;
  $arrayidx12 = (($10) + ($i<<2)|0);
  HEAP32[$arrayidx12>>2] = $11;
  return;
 }
 $x = ((($q)) + 4|0);
 $1 = HEAP32[$x>>2]|0;
 $arrayidx = (($1) + ($k<<2)|0);
 $2 = HEAP32[$arrayidx>>2]|0;
 $arrayidx3 = (($1) + ($i<<2)|0);
 $3 = HEAP32[$arrayidx3>>2]|0;
 $z = ((($q)) + 8|0);
 $4 = HEAP32[$z>>2]|0;
 $arrayidx5 = (($4) + ($k<<2)|0);
 $5 = HEAP32[$arrayidx5>>2]|0;
 $arrayidx8 = (($4) + ($i<<2)|0);
 $6 = HEAP32[$arrayidx8>>2]|0;
 $j$017 = 0;
 while(1) {
  $arrayidx1 = (($2) + ($j$017<<2)|0);
  $7 = HEAP32[$arrayidx1>>2]|0;
  $arrayidx4 = (($3) + ($j$017<<2)|0);
  HEAP32[$arrayidx4>>2] = $7;
  $arrayidx6 = (($5) + ($j$017<<2)|0);
  $8 = HEAP32[$arrayidx6>>2]|0;
  $arrayidx9 = (($6) + ($j$017<<2)|0);
  HEAP32[$arrayidx9>>2] = $8;
  $inc = (($j$017) + 1)|0;
  $9 = HEAP32[$over32>>2]|0;
  $cmp = ($inc|0)<($9|0);
  if ($cmp) {
   $j$017 = $inc;
  } else {
   break;
  }
 }
 $r = ((($q)) + 12|0);
 $10 = HEAP32[$r>>2]|0;
 $arrayidx10 = (($10) + ($k<<2)|0);
 $11 = HEAP32[$arrayidx10>>2]|0;
 $arrayidx12 = (($10) + ($i<<2)|0);
 HEAP32[$arrayidx12>>2] = $11;
 return;
}
function __Z6rowsetR6QStatell($q,$i,$b) {
 $q = $q|0;
 $i = $i|0;
 $b = $b|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and13$pn = 0, $arrayidx = 0, $arrayidx1 = 0, $arrayidx16 = 0, $arrayidx17 = 0, $arrayidx2 = 0, $arrayidx3 = 0, $arrayidx4 = 0, $cmp = 0, $cmp23 = 0;
 var $cmp5 = 0, $inc = 0, $j$024 = 0, $over32 = 0, $r = 0, $shl14$sink = 0, $shr10$sink = 0, $shr10$sink$in = 0, $sub = 0, $x = 0, $x6 = 0, $z = 0, $z15 = 0, $z15$sink = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $over32 = ((($q)) + 16|0);
 $0 = HEAP32[$over32>>2]|0;
 $cmp23 = ($0|0)>(0);
 if ($cmp23) {
  $x = ((($q)) + 4|0);
  $1 = HEAP32[$x>>2]|0;
  $arrayidx = (($1) + ($i<<2)|0);
  $2 = HEAP32[$arrayidx>>2]|0;
  $z = ((($q)) + 8|0);
  $3 = HEAP32[$z>>2]|0;
  $arrayidx2 = (($3) + ($i<<2)|0);
  $4 = HEAP32[$arrayidx2>>2]|0;
  $j$024 = 0;
  while(1) {
   $arrayidx1 = (($2) + ($j$024<<2)|0);
   HEAP32[$arrayidx1>>2] = 0;
   $arrayidx3 = (($4) + ($j$024<<2)|0);
   HEAP32[$arrayidx3>>2] = 0;
   $inc = (($j$024) + 1)|0;
   $5 = HEAP32[$over32>>2]|0;
   $cmp = ($inc|0)<($5|0);
   if ($cmp) {
    $j$024 = $inc;
   } else {
    break;
   }
  }
 }
 $r = ((($q)) + 12|0);
 $6 = HEAP32[$r>>2]|0;
 $arrayidx4 = (($6) + ($i<<2)|0);
 HEAP32[$arrayidx4>>2] = 0;
 $7 = HEAP32[$q>>2]|0;
 $cmp5 = ($7|0)>($b|0);
 $sub = (($b) - ($7))|0;
 $z15 = ((($q)) + 8|0);
 $x6 = ((($q)) + 4|0);
 $z15$sink = $cmp5 ? $x6 : $z15;
 $shr10$sink$in = $cmp5 ? $b : $sub;
 $and13$pn = $shr10$sink$in & 31;
 $shl14$sink = 1 << $and13$pn;
 $shr10$sink = $shr10$sink$in >> 5;
 $8 = HEAP32[$z15$sink>>2]|0;
 $arrayidx16 = (($8) + ($i<<2)|0);
 $9 = HEAP32[$arrayidx16>>2]|0;
 $arrayidx17 = (($9) + ($shr10$sink<<2)|0);
 HEAP32[$arrayidx17>>2] = $shl14$sink;
 return;
}
function __Z8cliffordR6QStatell($q,$i,$k) {
 $q = $q|0;
 $i = $i|0;
 $k = $k|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add124 = 0, $add127 = 0, $and = 0, $and111 = 0, $and12 = 0, $and30 = 0, $and44 = 0, $and50 = 0, $and56 = 0, $and85 = 0, $and91 = 0;
 var $and97 = 0, $arrayidx = 0, $arrayidx10 = 0, $arrayidx109 = 0, $arrayidx11 = 0, $arrayidx110 = 0, $arrayidx121 = 0, $arrayidx123 = 0, $arrayidx28 = 0, $arrayidx29 = 0, $arrayidx4 = 0, $arrayidx42 = 0, $arrayidx43 = 0, $arrayidx48 = 0, $arrayidx49 = 0, $arrayidx54 = 0, $arrayidx55 = 0, $arrayidx83 = 0, $arrayidx84 = 0, $arrayidx89 = 0;
 var $arrayidx90 = 0, $arrayidx95 = 0, $arrayidx96 = 0, $cmp = 0, $cmp125 = 0, $cmp99 = 0, $dec = 0, $dec114 = 0, $dec73 = 0, $e$0$lcssa = 0, $e$0101 = 0, $e$198 = 0, $e$3$ph = 0, $e$7 = 0, $exitcond = 0, $inc = 0, $inc100 = 0, $inc117 = 0, $inc119 = 0, $inc59 = 0;
 var $j$0100 = 0, $l$097 = 0, $not$tobool57 = 0, $over32 = 0, $r = 0, $rem = 0, $retval$0 = 0, $shl = 0, $spec$select = 0, $spec$select89 = 0, $spec$select90 = 0, $spec$select91 = 0, $spec$select92 = 0, $spec$select93 = 0, $tobool = 0, $tobool112 = 0, $tobool13 = 0, $tobool31 = 0, $tobool45 = 0, $tobool51 = 0;
 var $tobool57 = 0, $tobool86 = 0, $tobool92 = 0, $tobool98 = 0, $x = 0, $z41 = 0, $z82 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $over32 = ((($q)) + 16|0);
 $0 = HEAP32[$over32>>2]|0;
 $cmp99 = ($0|0)>(0);
 if (!($cmp99)) {
  $e$0$lcssa = 0;
  $r = ((($q)) + 12|0);
  $25 = HEAP32[$r>>2]|0;
  $arrayidx121 = (($25) + ($i<<2)|0);
  $26 = HEAP32[$arrayidx121>>2]|0;
  $add = (($26) + ($e$0$lcssa))|0;
  $arrayidx123 = (($25) + ($k<<2)|0);
  $27 = HEAP32[$arrayidx123>>2]|0;
  $add124 = (($add) + ($27))|0;
  $rem = (($add124|0) % 4)&-1;
  $cmp125 = ($rem|0)>(-1);
  $add127 = (($rem) + 4)|0;
  $retval$0 = $cmp125 ? $rem : $add127;
  return ($retval$0|0);
 }
 $x = ((($q)) + 4|0);
 $1 = HEAP32[$x>>2]|0;
 $arrayidx = (($1) + ($k<<2)|0);
 $2 = HEAP32[$arrayidx>>2]|0;
 $z82 = ((($q)) + 8|0);
 $3 = HEAP32[$z82>>2]|0;
 $arrayidx83 = (($3) + ($k<<2)|0);
 $4 = HEAP32[$arrayidx83>>2]|0;
 $arrayidx89 = (($1) + ($i<<2)|0);
 $arrayidx10 = (($1) + ($i<<2)|0);
 $arrayidx28 = (($3) + ($i<<2)|0);
 $z41 = ((($q)) + 8|0);
 $5 = HEAP32[$z41>>2]|0;
 $arrayidx42 = (($5) + ($k<<2)|0);
 $arrayidx95 = (($3) + ($i<<2)|0);
 $arrayidx109 = (($3) + ($i<<2)|0);
 $arrayidx48 = (($1) + ($i<<2)|0);
 $arrayidx54 = (($5) + ($i<<2)|0);
 $6 = HEAP32[$over32>>2]|0;
 $e$0101 = 0;$j$0100 = 0;
 while(1) {
  $arrayidx4 = (($2) + ($j$0100<<2)|0);
  $7 = HEAP32[$arrayidx4>>2]|0;
  $arrayidx84 = (($4) + ($j$0100<<2)|0);
  $8 = HEAP32[$arrayidx84>>2]|0;
  $e$198 = $e$0101;$l$097 = 0;
  while(1) {
   $shl = 1 << $l$097;
   $and = $7 & $shl;
   $tobool = ($and|0)==(0);
   $and85 = $8 & $shl;
   $tobool86 = ($and85|0)==(0);
   do {
    if ($tobool) {
     if ($tobool86) {
      $e$7 = $e$198;
     } else {
      $19 = HEAP32[$arrayidx89>>2]|0;
      $arrayidx90 = (($19) + ($j$0100<<2)|0);
      $20 = HEAP32[$arrayidx90>>2]|0;
      $and91 = $20 & $shl;
      $tobool92 = ($and91|0)==(0);
      if ($tobool92) {
       $e$7 = $e$198;
      } else {
       $21 = HEAP32[$arrayidx95>>2]|0;
       $arrayidx96 = (($21) + ($j$0100<<2)|0);
       $22 = HEAP32[$arrayidx96>>2]|0;
       $and97 = $22 & $shl;
       $tobool98 = ($and97|0)==(0);
       $inc100 = $tobool98&1;
       $spec$select92 = (($e$198) + ($inc100))|0;
       $23 = HEAP32[$arrayidx109>>2]|0;
       $arrayidx110 = (($23) + ($j$0100<<2)|0);
       $24 = HEAP32[$arrayidx110>>2]|0;
       $and111 = $24 & $shl;
       $tobool112 = ($and111|0)!=(0);
       $dec114 = $tobool112 << 31 >> 31;
       $spec$select93 = (($spec$select92) + ($dec114))|0;
       $e$7 = $spec$select93;
      }
     }
    } else {
     do {
      if ($tobool86) {
       $9 = HEAP32[$arrayidx10>>2]|0;
       $arrayidx11 = (($9) + ($j$0100<<2)|0);
       $10 = HEAP32[$arrayidx11>>2]|0;
       $and12 = $10 & $shl;
       $tobool13 = ($and12|0)==(0);
       $11 = HEAP32[$arrayidx28>>2]|0;
       $arrayidx29 = (($11) + ($j$0100<<2)|0);
       $12 = HEAP32[$arrayidx29>>2]|0;
       $and30 = $12 & $shl;
       $tobool31 = ($and30|0)!=(0);
       if ($tobool13) {
        $dec = $tobool31 << 31 >> 31;
        $spec$select89 = (($e$198) + ($dec))|0;
        $e$3$ph = $spec$select89;
        break;
       } else {
        $inc = $tobool31&1;
        $spec$select = (($e$198) + ($inc))|0;
        $e$3$ph = $spec$select;
        break;
       }
      } else {
       $e$3$ph = $e$198;
      }
     } while(0);
     $13 = HEAP32[$arrayidx42>>2]|0;
     $arrayidx43 = (($13) + ($j$0100<<2)|0);
     $14 = HEAP32[$arrayidx43>>2]|0;
     $and44 = $14 & $shl;
     $tobool45 = ($and44|0)==(0);
     if ($tobool45) {
      $e$7 = $e$3$ph;
     } else {
      $15 = HEAP32[$arrayidx48>>2]|0;
      $arrayidx49 = (($15) + ($j$0100<<2)|0);
      $16 = HEAP32[$arrayidx49>>2]|0;
      $and50 = $16 & $shl;
      $tobool51 = ($and50|0)==(0);
      $17 = HEAP32[$arrayidx54>>2]|0;
      $arrayidx55 = (($17) + ($j$0100<<2)|0);
      $18 = HEAP32[$arrayidx55>>2]|0;
      $and56 = $18 & $shl;
      $tobool57 = ($and56|0)==(0);
      if ($tobool51) {
       $not$tobool57 = $tobool57 ^ 1;
       $inc59 = $not$tobool57&1;
       $spec$select90 = (($e$3$ph) + ($inc59))|0;
       $e$7 = $spec$select90;
       break;
      } else {
       $dec73 = $tobool57 << 31 >> 31;
       $spec$select91 = (($e$3$ph) + ($dec73))|0;
       $e$7 = $spec$select91;
       break;
      }
     }
    }
   } while(0);
   $inc117 = (($l$097) + 1)|0;
   $exitcond = ($inc117|0)==(32);
   if ($exitcond) {
    break;
   } else {
    $e$198 = $e$7;$l$097 = $inc117;
   }
  }
  $inc119 = (($j$0100) + 1)|0;
  $cmp = ($inc119|0)<($6|0);
  if ($cmp) {
   $e$0101 = $e$7;$j$0100 = $inc119;
  } else {
   $e$0$lcssa = $e$7;
   break;
  }
 }
 $r = ((($q)) + 12|0);
 $25 = HEAP32[$r>>2]|0;
 $arrayidx121 = (($25) + ($i<<2)|0);
 $26 = HEAP32[$arrayidx121>>2]|0;
 $add = (($26) + ($e$0$lcssa))|0;
 $arrayidx123 = (($25) + ($k<<2)|0);
 $27 = HEAP32[$arrayidx123>>2]|0;
 $add124 = (($add) + ($27))|0;
 $rem = (($add124|0) % 4)&-1;
 $cmp125 = ($rem|0)>(-1);
 $add127 = (($rem) + 4)|0;
 $retval$0 = $cmp125 ? $rem : $add127;
 return ($retval$0|0);
}
function __Z7rowmultR6QStatell($q,$i,$k) {
 $q = $q|0;
 $i = $i|0;
 $k = $k|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $arrayidx = 0, $arrayidx1 = 0, $arrayidx10 = 0, $arrayidx2 = 0, $arrayidx4 = 0, $arrayidx5 = 0, $arrayidx6 = 0;
 var $arrayidx7 = 0, $arrayidx9 = 0, $call = 0, $cmp = 0, $cmp18 = 0, $inc = 0, $j$019 = 0, $over32 = 0, $r = 0, $x = 0, $xor = 0, $xor11 = 0, $z = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__Z8cliffordR6QStatell($q,$i,$k)|0);
 $r = ((($q)) + 12|0);
 $0 = HEAP32[$r>>2]|0;
 $arrayidx = (($0) + ($i<<2)|0);
 HEAP32[$arrayidx>>2] = $call;
 $over32 = ((($q)) + 16|0);
 $1 = HEAP32[$over32>>2]|0;
 $cmp18 = ($1|0)>(0);
 if (!($cmp18)) {
  return;
 }
 $x = ((($q)) + 4|0);
 $2 = HEAP32[$x>>2]|0;
 $arrayidx1 = (($2) + ($k<<2)|0);
 $3 = HEAP32[$arrayidx1>>2]|0;
 $arrayidx4 = (($2) + ($i<<2)|0);
 $4 = HEAP32[$arrayidx4>>2]|0;
 $z = ((($q)) + 8|0);
 $5 = HEAP32[$z>>2]|0;
 $arrayidx6 = (($5) + ($k<<2)|0);
 $6 = HEAP32[$arrayidx6>>2]|0;
 $arrayidx9 = (($5) + ($i<<2)|0);
 $7 = HEAP32[$arrayidx9>>2]|0;
 $j$019 = 0;
 while(1) {
  $arrayidx2 = (($3) + ($j$019<<2)|0);
  $8 = HEAP32[$arrayidx2>>2]|0;
  $arrayidx5 = (($4) + ($j$019<<2)|0);
  $9 = HEAP32[$arrayidx5>>2]|0;
  $xor = $9 ^ $8;
  HEAP32[$arrayidx5>>2] = $xor;
  $arrayidx7 = (($6) + ($j$019<<2)|0);
  $10 = HEAP32[$arrayidx7>>2]|0;
  $arrayidx10 = (($7) + ($j$019<<2)|0);
  $11 = HEAP32[$arrayidx10>>2]|0;
  $xor11 = $11 ^ $10;
  HEAP32[$arrayidx10>>2] = $xor11;
  $inc = (($j$019) + 1)|0;
  $12 = HEAP32[$over32>>2]|0;
  $cmp = ($inc|0)<($12|0);
  if ($cmp) {
   $j$019 = $inc;
  } else {
   break;
  }
 }
 return;
}
function __Z7measureR6QStatelib($q,$b,$sup,$random_result) {
 $q = $q|0;
 $b = $b|0;
 $sup = $sup|0;
 $random_result = $random_result|0;
 var $$ = 0, $$63 = 0, $$lcssa = 0, $$lcssa65 = 0, $$lcssa66 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add10 = 0, $add12 = 0, $add14 = 0, $add17 = 0, $add37 = 0, $add63 = 0, $add78 = 0;
 var $and = 0, $and28 = 0, $and3 = 0, $and53 = 0, $and72 = 0, $arrayidx = 0, $arrayidx18 = 0, $arrayidx2 = 0, $arrayidx26 = 0, $arrayidx27 = 0, $arrayidx38 = 0, $arrayidx51 = 0, $arrayidx52 = 0, $arrayidx70 = 0, $arrayidx71 = 0, $arrayidx86 = 0, $cmp = 0, $cmp22 = 0, $cmp2271 = 0, $cmp24 = 0;
 var $cmp48 = 0, $cmp4877 = 0, $cmp67 = 0, $cmp6774 = 0, $cmp81 = 0, $cond = 0, $i$072 = 0, $i$1 = 0, $i$173 = 0, $i$175 = 0, $inc = 0, $inc33 = 0, $inc58 = 0, $m$0$lcssa = 0, $m$078 = 0, $mul = 0, $mul21 = 0, $mul61 = 0, $mul76 = 0, $mul85 = 0;
 var $p$082 = 0, $r = 0, $r83 = 0, $retval$0 = 0, $shl = 0, $shr = 0, $tobool = 0, $tobool29 = 0, $tobool39 = 0, $tobool44 = 0, $tobool54 = 0, $tobool73 = 0, $tobool87 = 0, $x = 0, $x25 = 0, $x50 = 0, $x69 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shr = $b >> 5;
 $and = $b & 31;
 $shl = 1 << $and;
 $0 = HEAP32[$q>>2]|0;
 $cmp81 = ($0|0)>(0);
 L1: do {
  if ($cmp81) {
   $x = ((($q)) + 4|0);
   $1 = HEAP32[$x>>2]|0;
   $2 = HEAP32[$q>>2]|0;
   $3 = $0;$p$082 = 0;
   while(1) {
    $add = (($3) + ($p$082))|0;
    $arrayidx = (($1) + ($add<<2)|0);
    $4 = HEAP32[$arrayidx>>2]|0;
    $arrayidx2 = (($4) + ($shr<<2)|0);
    $5 = HEAP32[$arrayidx2>>2]|0;
    $and3 = $5 & $shl;
    $tobool = ($and3|0)==(0);
    if (!($tobool)) {
     break;
    }
    $inc = (($p$082) + 1)|0;
    $cmp = ($inc|0)<($2|0);
    if ($cmp) {
     $3 = $2;$p$082 = $inc;
    } else {
     $$lcssa66 = $2;
     break L1;
    }
   }
   $add10 = (($3) + ($p$082))|0;
   __Z7rowcopyR6QStatell($q,$p$082,$add10);
   $6 = HEAP32[$q>>2]|0;
   $add12 = (($6) + ($p$082))|0;
   $add14 = (($6) + ($b))|0;
   __Z6rowsetR6QStatell($q,$add12,$add14);
   $cond = $random_result&1;
   $mul = $cond << 1;
   $r = ((($q)) + 12|0);
   $7 = HEAP32[$r>>2]|0;
   $8 = HEAP32[$q>>2]|0;
   $add17 = (($8) + ($p$082))|0;
   $arrayidx18 = (($7) + ($add17<<2)|0);
   HEAP32[$arrayidx18>>2] = $mul;
   $9 = HEAP32[$q>>2]|0;
   $cmp2271 = ($9|0)>(0);
   if ($cmp2271) {
    $x25 = ((($q)) + 4|0);
    $i$072 = 0;
    while(1) {
     $cmp24 = ($i$072|0)==($p$082|0);
     if (!($cmp24)) {
      $10 = HEAP32[$x25>>2]|0;
      $arrayidx26 = (($10) + ($i$072<<2)|0);
      $11 = HEAP32[$arrayidx26>>2]|0;
      $arrayidx27 = (($11) + ($shr<<2)|0);
      $12 = HEAP32[$arrayidx27>>2]|0;
      $and28 = $12 & $shl;
      $tobool29 = ($and28|0)==(0);
      if (!($tobool29)) {
       __Z7rowmultR6QStatell($q,$i$072,$p$082);
      }
     }
     $inc33 = (($i$072) + 1)|0;
     $13 = HEAP32[$q>>2]|0;
     $mul21 = $13 << 1;
     $cmp22 = ($inc33|0)<($mul21|0);
     if ($cmp22) {
      $i$072 = $inc33;
     } else {
      $$lcssa = $13;
      break;
     }
    }
   } else {
    $$lcssa = $9;
   }
   $14 = HEAP32[$r>>2]|0;
   $add37 = (($$lcssa) + ($p$082))|0;
   $arrayidx38 = (($14) + ($add37<<2)|0);
   $15 = HEAP32[$arrayidx38>>2]|0;
   $tobool39 = ($15|0)==(0);
   $$ = $tobool39 ? 2 : 3;
   $retval$0 = $$;
   return ($retval$0|0);
  } else {
   $$lcssa66 = $0;
  }
 } while(0);
 $tobool44 = ($sup|0)==(0);
 if (!($tobool44)) {
  $retval$0 = 0;
  return ($retval$0|0);
 }
 $cmp4877 = ($$lcssa66|0)>(0);
 L21: do {
  if ($cmp4877) {
   $x50 = ((($q)) + 4|0);
   $16 = HEAP32[$x50>>2]|0;
   $m$078 = 0;
   while(1) {
    $arrayidx51 = (($16) + ($m$078<<2)|0);
    $17 = HEAP32[$arrayidx51>>2]|0;
    $arrayidx52 = (($17) + ($shr<<2)|0);
    $18 = HEAP32[$arrayidx52>>2]|0;
    $and53 = $18 & $shl;
    $tobool54 = ($and53|0)==(0);
    if (!($tobool54)) {
     $m$0$lcssa = $m$078;
     break L21;
    }
    $inc58 = (($m$078) + 1)|0;
    $cmp48 = ($inc58|0)<($$lcssa66|0);
    if ($cmp48) {
     $m$078 = $inc58;
    } else {
     $m$0$lcssa = $inc58;
     break;
    }
   }
  } else {
   $m$0$lcssa = 0;
  }
 } while(0);
 $mul61 = $$lcssa66 << 1;
 $add63 = (($m$0$lcssa) + ($$lcssa66))|0;
 __Z7rowcopyR6QStatell($q,$mul61,$add63);
 $i$173 = (($m$0$lcssa) + 1)|0;
 $19 = HEAP32[$q>>2]|0;
 $cmp6774 = ($i$173|0)<($19|0);
 if ($cmp6774) {
  $x69 = ((($q)) + 4|0);
  $23 = $19;$i$175 = $i$173;
  while(1) {
   $20 = HEAP32[$x69>>2]|0;
   $arrayidx70 = (($20) + ($i$175<<2)|0);
   $21 = HEAP32[$arrayidx70>>2]|0;
   $arrayidx71 = (($21) + ($shr<<2)|0);
   $22 = HEAP32[$arrayidx71>>2]|0;
   $and72 = $22 & $shl;
   $tobool73 = ($and72|0)==(0);
   if (!($tobool73)) {
    $add78 = (($i$175) + ($23))|0;
    $mul76 = $23 << 1;
    __Z7rowmultR6QStatell($q,$mul76,$add78);
   }
   $i$1 = (($i$175) + 1)|0;
   $24 = HEAP32[$q>>2]|0;
   $cmp67 = ($i$1|0)<($24|0);
   if ($cmp67) {
    $23 = $24;$i$175 = $i$1;
   } else {
    $$lcssa65 = $24;
    break;
   }
  }
 } else {
  $$lcssa65 = $19;
 }
 $r83 = ((($q)) + 12|0);
 $25 = HEAP32[$r83>>2]|0;
 $mul85 = $$lcssa65 << 1;
 $arrayidx86 = (($25) + ($mul85<<2)|0);
 $26 = HEAP32[$arrayidx86>>2]|0;
 $tobool87 = ($26|0)!=(0);
 $$63 = $tobool87&1;
 $retval$0 = $$63;
 return ($retval$0|0);
}
function __Z9initstae_R6QStatel($q,$n) {
 $q = $q|0;
 $n = $n|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add15 = 0;
 var $add18 = 0, $add1845 = 0, $and49$pn = 0, $and49$pn$in = 0, $arrayidx = 0, $arrayidx27 = 0, $arrayidx33 = 0, $arrayidx34 = 0, $arrayidx36 = 0, $arrayidx37 = 0, $arrayidx41 = 0, $arrayidx43 = 0, $arrayidx52 = 0, $arrayidx54 = 0, $arrayidx54$sink = 0, $arrayidx57 = 0, $call = 0, $call13 = 0, $call21 = 0, $call25 = 0;
 var $call8 = 0, $cmp = 0, $cmp30 = 0, $cmp3042 = 0, $cmp39 = 0, $cmp46 = 0, $cmp47 = 0, $i$048 = 0, $inc = 0, $inc59 = 0, $j$043 = 0, $mul = 0, $mul17 = 0, $mul1744 = 0, $mul20 = 0, $mul45 = 0, $over32 = 0, $r = 0, $shl50$sink = 0, $shr = 0;
 var $shr53 = 0, $sub = 0, $x = 0, $z = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$q>>2] = $n;
 $mul = $n << 3;
 $add = $mul | 4;
 $call = (_malloc($add)|0);
 $x = ((($q)) + 4|0);
 HEAP32[$x>>2] = $call;
 $call8 = (_malloc($add)|0);
 $z = ((($q)) + 8|0);
 HEAP32[$z>>2] = $call8;
 $call13 = (_malloc($add)|0);
 $r = ((($q)) + 12|0);
 HEAP32[$r>>2] = $call13;
 $shr = $n >> 5;
 $add15 = (($shr) + 1)|0;
 $over32 = ((($q)) + 16|0);
 HEAP32[$over32>>2] = $add15;
 $0 = HEAP32[$q>>2]|0;
 $mul1744 = $0 << 1;
 $add1845 = $mul1744 | 1;
 $cmp47 = ($add1845|0)>(0);
 if (!($cmp47)) {
  return;
 }
 $i$048 = 0;
 while(1) {
  $1 = HEAP32[$over32>>2]|0;
  $mul20 = $1 << 2;
  $call21 = (_malloc($mul20)|0);
  $2 = HEAP32[$x>>2]|0;
  $arrayidx = (($2) + ($i$048<<2)|0);
  HEAP32[$arrayidx>>2] = $call21;
  $call25 = (_malloc($mul20)|0);
  $3 = HEAP32[$z>>2]|0;
  $arrayidx27 = (($3) + ($i$048<<2)|0);
  HEAP32[$arrayidx27>>2] = $call25;
  $4 = HEAP32[$over32>>2]|0;
  $cmp3042 = ($4|0)>(0);
  if ($cmp3042) {
   $5 = HEAP32[$x>>2]|0;
   $arrayidx33 = (($5) + ($i$048<<2)|0);
   $6 = HEAP32[$arrayidx33>>2]|0;
   $7 = HEAP32[$z>>2]|0;
   $arrayidx36 = (($7) + ($i$048<<2)|0);
   $8 = HEAP32[$arrayidx36>>2]|0;
   $j$043 = 0;
   while(1) {
    $arrayidx34 = (($6) + ($j$043<<2)|0);
    HEAP32[$arrayidx34>>2] = 0;
    $arrayidx37 = (($8) + ($j$043<<2)|0);
    HEAP32[$arrayidx37>>2] = 0;
    $inc = (($j$043) + 1)|0;
    $9 = HEAP32[$over32>>2]|0;
    $cmp30 = ($inc|0)<($9|0);
    if ($cmp30) {
     $j$043 = $inc;
    } else {
     break;
    }
   }
  }
  $10 = HEAP32[$q>>2]|0;
  $cmp39 = ($i$048|0)<($10|0);
  if ($cmp39) {
   $11 = HEAP32[$x>>2]|0;
   $arrayidx41 = (($11) + ($i$048<<2)|0);
   $12 = HEAP32[$arrayidx41>>2]|0;
   $13 = $i$048 >>> 5;
   $arrayidx43 = (($12) + ($13<<2)|0);
   $and49$pn$in = $i$048;$arrayidx54$sink = $arrayidx43;
   label = 10;
  } else {
   $mul45 = $10 << 1;
   $cmp46 = ($i$048|0)<($mul45|0);
   if ($cmp46) {
    $sub = (($i$048) - ($10))|0;
    $14 = HEAP32[$z>>2]|0;
    $arrayidx52 = (($14) + ($i$048<<2)|0);
    $15 = HEAP32[$arrayidx52>>2]|0;
    $shr53 = $sub >> 5;
    $arrayidx54 = (($15) + ($shr53<<2)|0);
    $and49$pn$in = $sub;$arrayidx54$sink = $arrayidx54;
    label = 10;
   }
  }
  if ((label|0) == 10) {
   label = 0;
   $and49$pn = $and49$pn$in & 31;
   $shl50$sink = 1 << $and49$pn;
   HEAP32[$arrayidx54$sink>>2] = $shl50$sink;
  }
  $16 = HEAP32[$r>>2]|0;
  $arrayidx57 = (($16) + ($i$048<<2)|0);
  HEAP32[$arrayidx57>>2] = 0;
  $inc59 = (($i$048) + 1)|0;
  $17 = HEAP32[$q>>2]|0;
  $mul17 = $17 << 1;
  $add18 = $mul17 | 1;
  $cmp = ($inc59|0)<($add18|0);
  if ($cmp) {
   $i$048 = $inc59;
  } else {
   break;
  }
 }
 return;
}
function __Z10free_stateR6QState($q) {
 $q = $q|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $add = 0, $add11 = 0, $arrayidx = 0, $arrayidx1 = 0, $cmp = 0, $cmp12 = 0, $i$013 = 0, $inc = 0, $mul = 0, $mul10 = 0, $r = 0;
 var $x = 0, $z = 0, $z3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$q>>2]|0;
 $mul10 = $0 << 1;
 $add11 = $mul10 | 1;
 $cmp12 = ($add11|0)>(0);
 $x = ((($q)) + 4|0);
 if ($cmp12) {
  $z = ((($q)) + 8|0);
  $i$013 = 0;
  while(1) {
   $4 = HEAP32[$x>>2]|0;
   $arrayidx = (($4) + ($i$013<<2)|0);
   $5 = HEAP32[$arrayidx>>2]|0;
   _free($5);
   $6 = HEAP32[$z>>2]|0;
   $arrayidx1 = (($6) + ($i$013<<2)|0);
   $7 = HEAP32[$arrayidx1>>2]|0;
   _free($7);
   $inc = (($i$013) + 1)|0;
   $8 = HEAP32[$q>>2]|0;
   $mul = $8 << 1;
   $add = $mul | 1;
   $cmp = ($inc|0)<($add|0);
   if ($cmp) {
    $i$013 = $inc;
   } else {
    break;
   }
  }
 }
 $1 = HEAP32[$x>>2]|0;
 _free($1);
 $z3 = ((($q)) + 8|0);
 $2 = HEAP32[$z3>>2]|0;
 _free($2);
 $r = ((($q)) + 12|0);
 $3 = HEAP32[$r>>2]|0;
 _free($3);
 return;
}
function __Z10copy_stateR6QStateRKS_($q,$src) {
 $q = $q|0;
 $src = $src|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $arrayidx = 0, $arrayidx20 = 0, $arrayidx22 = 0, $arrayidx24 = 0;
 var $arrayidx28 = 0, $arrayidx30 = 0, $call = 0, $call11 = 0, $call14 = 0, $call18 = 0, $call9 = 0, $cmp32 = 0, $exitcond = 0, $i$033 = 0, $inc = 0, $mul = 0, $mul13 = 0, $mul32 = 0, $mul4 = 0, $over32 = 0, $over322 = 0, $r = 0, $r6 = 0, $x = 0;
 var $x23 = 0, $z = 0, $z29 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$src>>2]|0;
 HEAP32[$q>>2] = $0;
 $over32 = ((($src)) + 16|0);
 $1 = HEAP32[$over32>>2]|0;
 $over322 = ((($q)) + 16|0);
 HEAP32[$over322>>2] = $1;
 $mul = $0 << 1;
 $add = $mul | 1;
 $mul4 = $add << 2;
 $call = (_malloc($mul4)|0);
 $r = ((($q)) + 12|0);
 HEAP32[$r>>2] = $call;
 $r6 = ((($src)) + 12|0);
 $2 = HEAP32[$r6>>2]|0;
 _memcpy(($call|0),($2|0),($mul4|0))|0;
 $call9 = (_malloc($mul4)|0);
 $x = ((($q)) + 4|0);
 HEAP32[$x>>2] = $call9;
 $call11 = (_malloc($mul4)|0);
 $z = ((($q)) + 8|0);
 HEAP32[$z>>2] = $call11;
 $cmp32 = ($add|0)>(0);
 if (!($cmp32)) {
  return;
 }
 $x23 = ((($src)) + 4|0);
 $z29 = ((($src)) + 8|0);
 $i$033 = 0;
 while(1) {
  $3 = HEAP32[$over322>>2]|0;
  $mul13 = $3 << 2;
  $call14 = (_malloc($mul13)|0);
  $4 = HEAP32[$x>>2]|0;
  $arrayidx = (($4) + ($i$033<<2)|0);
  HEAP32[$arrayidx>>2] = $call14;
  $call18 = (_malloc($mul13)|0);
  $5 = HEAP32[$z>>2]|0;
  $arrayidx20 = (($5) + ($i$033<<2)|0);
  HEAP32[$arrayidx20>>2] = $call18;
  $6 = HEAP32[$x>>2]|0;
  $arrayidx22 = (($6) + ($i$033<<2)|0);
  $7 = HEAP32[$arrayidx22>>2]|0;
  $8 = HEAP32[$x23>>2]|0;
  $arrayidx24 = (($8) + ($i$033<<2)|0);
  $9 = HEAP32[$arrayidx24>>2]|0;
  _memcpy(($7|0),($9|0),($mul13|0))|0;
  $10 = HEAP32[$z>>2]|0;
  $arrayidx28 = (($10) + ($i$033<<2)|0);
  $11 = HEAP32[$arrayidx28>>2]|0;
  $12 = HEAP32[$z29>>2]|0;
  $arrayidx30 = (($12) + ($i$033<<2)|0);
  $13 = HEAP32[$arrayidx30>>2]|0;
  $14 = HEAP32[$over322>>2]|0;
  $mul32 = $14 << 2;
  _memcpy(($11|0),($13|0),($mul32|0))|0;
  $inc = (($i$033) + 1)|0;
  $exitcond = ($inc|0)==($add|0);
  if ($exitcond) {
   break;
  } else {
   $i$033 = $inc;
  }
 }
 return;
}
function __Z12peek_state_xRK6QStateii($src,$row,$col) {
 $src = $src|0;
 $row = $row|0;
 $col = $col|0;
 var $0 = 0, $1 = 0, $2 = 0, $and = 0, $and2 = 0, $arrayidx = 0, $arrayidx1 = 0, $conv = 0, $shl = 0, $shr = 0, $tobool = 0, $x = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shr = $col >> 5;
 $and = $col & 31;
 $shl = 1 << $and;
 $x = ((($src)) + 4|0);
 $0 = HEAP32[$x>>2]|0;
 $arrayidx = (($0) + ($row<<2)|0);
 $1 = HEAP32[$arrayidx>>2]|0;
 $arrayidx1 = (($1) + ($shr<<2)|0);
 $2 = HEAP32[$arrayidx1>>2]|0;
 $and2 = $2 & $shl;
 $tobool = ($and2|0)!=(0);
 $conv = $tobool&1;
 return ($conv|0);
}
function __Z12peek_state_zRK6QStateii($src,$row,$col) {
 $src = $src|0;
 $row = $row|0;
 $col = $col|0;
 var $0 = 0, $1 = 0, $2 = 0, $and = 0, $and2 = 0, $arrayidx = 0, $arrayidx1 = 0, $conv = 0, $shl = 0, $shr = 0, $tobool = 0, $z = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shr = $col >> 5;
 $and = $col & 31;
 $shl = 1 << $and;
 $z = ((($src)) + 8|0);
 $0 = HEAP32[$z>>2]|0;
 $arrayidx = (($0) + ($row<<2)|0);
 $1 = HEAP32[$arrayidx>>2]|0;
 $arrayidx1 = (($1) + ($shr<<2)|0);
 $2 = HEAP32[$arrayidx1>>2]|0;
 $and2 = $2 & $shl;
 $tobool = ($and2|0)!=(0);
 $conv = $tobool&1;
 return ($conv|0);
}
function __Z12peek_state_rRK6QStatei($src,$row) {
 $src = $src|0;
 $row = $row|0;
 var $0 = 0, $1 = 0, $arrayidx = 0, $conv = 0, $r = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $r = ((($src)) + 12|0);
 $0 = HEAP32[$r>>2]|0;
 $arrayidx = (($0) + ($row<<2)|0);
 $1 = HEAP32[$arrayidx>>2]|0;
 $tobool = ($1|0)!=(0);
 $conv = $tobool&1;
 return ($conv|0);
}
function ___cxx_global_var_init() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN38EmscriptenBindingInitializer_my_moduleC2Ev(0);
 return;
}
function __ZN38EmscriptenBindingInitializer_my_moduleC2Ev($this) {
 $this = $this|0;
 var $call$i = 0, $call$i$i$i = 0, $call$i$i10$i = 0, $call$i$i11$i = 0, $call$i$i9$i = 0, $call2$i = 0, $call3$i = 0, $call4$i = 0, $call5$i = 0, $call6$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10emscripten8internal11NoBaseClass6verifyI6QStateEEvv();
 $call$i = (__ZN10emscripten8internal11NoBaseClass11getUpcasterI6QStateEEPFvvEv()|0);
 $call2$i = (__ZN10emscripten8internal11NoBaseClass13getDowncasterI6QStateEEPFvvEv()|0);
 $call3$i = (__ZN10emscripten8internal6TypeIDI6QStatevE3getEv()|0);
 $call4$i = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI6QStateEEvE3getEv()|0);
 $call5$i = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK6QStateEEvE3getEv()|0);
 $call6$i = (__ZN10emscripten8internal11NoBaseClass3getEv()|0);
 $call$i$i$i = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0);
 $call$i$i9$i = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0);
 $call$i$i10$i = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0);
 $call$i$i11$i = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0);
 __embind_register_class(($call3$i|0),($call4$i|0),($call5$i|0),($call6$i|0),($call$i$i$i|0),(1|0),($call$i$i9$i|0),($call$i|0),($call$i$i10$i|0),($call2$i|0),(792|0),($call$i$i11$i|0),(9|0));
 __ZN10emscripten8internal24RegisterClassConstructorIPFP6QStatevEE6invokeIS2_JEEEvS5_(1);
 __ZN10emscripten8functionIvJR6QStatelEJEEEvPKcPFT_DpT0_EDpT1_(799,1);
 __ZN10emscripten8functionIvJR6QStatellEJEEEvPKcPFT_DpT0_EDpT1_(810,1);
 __ZN10emscripten8functionIvJR6QStatelEJEEEvPKcPFT_DpT0_EDpT1_(815,2);
 __ZN10emscripten8functionIvJR6QStatelEJEEEvPKcPFT_DpT0_EDpT1_(824,3);
 __ZN10emscripten8functionIiJR6QStatelibEJEEEvPKcPFT_DpT0_EDpT1_(830,1);
 __ZN10emscripten8functionIvJR6QStateEJEEEvPKcPFT_DpT0_EDpT1_(838,10);
 __ZN10emscripten8functionIvJR6QStateRKS1_EJEEEvPKcPFT_DpT0_EDpT1_(849,4);
 __ZN10emscripten8functionIcJRK6QStateiiEJEEEvPKcPFT_DpT0_EDpT1_(860,4);
 __ZN10emscripten8functionIcJRK6QStateiiEJEEEvPKcPFT_DpT0_EDpT1_(873,5);
 __ZN10emscripten8functionIcJRK6QStateiEJEEEvPKcPFT_DpT0_EDpT1_(886,1);
 return;
}
function __ZN10emscripten8functionIvJR6QStatelEJEEEvPKcPFT_DpT0_EDpT1_($name,$fn) {
 $name = $name|0;
 $fn = $fn|0;
 var $args = 0, $call = 0, $call$i$i = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $args = sp;
 $call = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStatelEE8getCountEv($args)|0);
 $call1 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStatelEE8getTypesEv($args)|0);
 $call$i$i = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0);
 __embind_register_function(($name|0),($call|0),($call1|0),($call$i$i|0),(2|0),($fn|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8functionIvJR6QStatellEJEEEvPKcPFT_DpT0_EDpT1_($name,$fn) {
 $name = $name|0;
 $fn = $fn|0;
 var $args = 0, $call = 0, $call$i$i = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $args = sp;
 $call = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStatellEE8getCountEv($args)|0);
 $call1 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStatellEE8getTypesEv($args)|0);
 $call$i$i = (__ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv()|0);
 __embind_register_function(($name|0),($call|0),($call1|0),($call$i$i|0),(4|0),($fn|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8functionIiJR6QStatelibEJEEEvPKcPFT_DpT0_EDpT1_($name,$fn) {
 $name = $name|0;
 $fn = $fn|0;
 var $args = 0, $call = 0, $call$i$i = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $args = sp;
 $call = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiR6QStatelibEE8getCountEv($args)|0);
 $call1 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiR6QStatelibEE8getTypesEv($args)|0);
 $call$i$i = (__ZN10emscripten8internal19getGenericSignatureIJiiiiiiEEEPKcv()|0);
 __embind_register_function(($name|0),($call|0),($call1|0),($call$i$i|0),(1|0),($fn|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8functionIvJR6QStateEJEEEvPKcPFT_DpT0_EDpT1_($name,$fn) {
 $name = $name|0;
 $fn = $fn|0;
 var $args = 0, $call = 0, $call$i$i = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $args = sp;
 $call = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStateEE8getCountEv($args)|0);
 $call1 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStateEE8getTypesEv($args)|0);
 $call$i$i = (__ZN10emscripten8internal19getGenericSignatureIJviiEEEPKcv()|0);
 __embind_register_function(($name|0),($call|0),($call1|0),($call$i$i|0),(5|0),($fn|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8functionIvJR6QStateRKS1_EJEEEvPKcPFT_DpT0_EDpT1_($name,$fn) {
 $name = $name|0;
 $fn = $fn|0;
 var $args = 0, $call = 0, $call$i$i = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $args = sp;
 $call = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStateRKS4_EE8getCountEv($args)|0);
 $call1 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStateRKS4_EE8getTypesEv($args)|0);
 $call$i$i = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0);
 __embind_register_function(($name|0),($call|0),($call1|0),($call$i$i|0),(3|0),($fn|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8functionIcJRK6QStateiiEJEEEvPKcPFT_DpT0_EDpT1_($name,$fn) {
 $name = $name|0;
 $fn = $fn|0;
 var $args = 0, $call = 0, $call$i$i = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $args = sp;
 $call = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJcRK6QStateiiEE8getCountEv($args)|0);
 $call1 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJcRK6QStateiiEE8getTypesEv($args)|0);
 $call$i$i = (__ZN10emscripten8internal19getGenericSignatureIJiiiiiEEEPKcv()|0);
 __embind_register_function(($name|0),($call|0),($call1|0),($call$i$i|0),(2|0),($fn|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8functionIcJRK6QStateiEJEEEvPKcPFT_DpT0_EDpT1_($name,$fn) {
 $name = $name|0;
 $fn = $fn|0;
 var $args = 0, $call = 0, $call$i$i = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $args = sp;
 $call = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJcRK6QStateiEE8getCountEv($args)|0);
 $call1 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJcRK6QStateiEE8getTypesEv($args)|0);
 $call$i$i = (__ZN10emscripten8internal19getGenericSignatureIJiiiiEEEPKcv()|0);
 __embind_register_function(($name|0),($call|0),($call1|0),($call$i$i|0),(6|0),($fn|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal11NoBaseClass6verifyI6QStateEEvv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10emscripten8internal13getActualTypeI6QStateEEPKvPT_($ptr) {
 $ptr = $ptr|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal14getLightTypeIDI6QStateEEPKvRKT_($ptr)|0);
 return ($call|0);
}
function __ZN10emscripten8internal11NoBaseClass11getUpcasterI6QStateEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0);
}
function __ZN10emscripten8internal11NoBaseClass13getDowncasterI6QStateEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0);
}
function __ZN10emscripten8internal14raw_destructorI6QStateEEvPT_($ptr) {
 $ptr = $ptr|0;
 var $isnull = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $isnull = ($ptr|0)==(0|0);
 if ($isnull) {
  return;
 }
 __ZdlPv($ptr);
 return;
}
function __ZN10emscripten8internal6TypeIDI6QStatevE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDI6QStateE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI6QStateEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIP6QStateE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK6QStateEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIPK6QStateE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11NoBaseClass3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0);
}
function __ZN10emscripten8internal14getLightTypeIDI6QStateEEPKvRKT_($value) {
 $value = $value|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (80|0);
}
function __ZN10emscripten8internal11LightTypeIDI6QStateE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (80|0);
}
function __ZN10emscripten8internal11LightTypeIDIP6QStateE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (88|0);
}
function __ZN10emscripten8internal11LightTypeIDIPK6QStateE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (104|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (926|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (929|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (931|0);
}
function __ZN10emscripten8internal12operator_newI6QStateJEEEPT_DpOT0_() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__Znwm(20)|0);
 ;HEAP32[$call>>2]=0|0;HEAP32[$call+4>>2]=0|0;HEAP32[$call+8>>2]=0|0;HEAP32[$call+12>>2]=0|0;HEAP32[$call+16>>2]=0|0;
 return ($call|0);
}
function __ZN10emscripten8internal24RegisterClassConstructorIPFP6QStatevEE6invokeIS2_JEEEvS5_($factory) {
 $factory = $factory|0;
 var $args = 0, $call = 0, $call$i$i = 0, $call1 = 0, $call2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $args = sp;
 $call = (__ZN10emscripten8internal6TypeIDI6QStatevE3getEv()|0);
 $call1 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP6QStateEE8getCountEv($args)|0);
 $call2 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP6QStateEE8getTypesEv($args)|0);
 $call$i$i = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0);
 __embind_register_class_constructor(($call|0),($call1|0),($call2|0),($call$i$i|0),(2|0),($factory|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal7InvokerIP6QStateJEE6invokeEPFS3_vE($fn) {
 $fn = $fn|0;
 var $call = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (FUNCTION_TABLE_i[$fn & 1]()|0);
 $call1 = (__ZN10emscripten8internal11BindingTypeIP6QStatevE10toWireTypeES3_($call)|0);
 return ($call1|0);
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP6QStateEE8getCountEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1;
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP6QStateEE8getTypesEv($this) {
 $this = $this|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI6QStateEEEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11BindingTypeIP6QStatevE10toWireTypeES3_($p) {
 $p = $p|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($p|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI6QStateEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (568|0);
}
function __ZN10emscripten8internal7InvokerIvJR6QStatelEE6invokeEPFvS3_lEPS2_l($fn,$args,$args1) {
 $fn = $fn|0;
 $args = $args|0;
 $args1 = $args1|0;
 var $call = 0, $call3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args)|0);
 $call3 = (__ZN10emscripten8internal11BindingTypeIlvE12fromWireTypeEl($args1)|0);
 FUNCTION_TABLE_vii[$fn & 7]($call,$call3);
 return;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStatelEE8getCountEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 3;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStatelEE8getTypesEv($this) {
 $this = $this|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvR6QStatelEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($p) {
 $p = $p|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($p|0);
}
function __ZN10emscripten8internal11BindingTypeIlvE12fromWireTypeEl($v) {
 $v = $v|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($v|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvR6QStatelEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (572|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (934|0);
}
function __ZN10emscripten8internal7InvokerIvJR6QStatellEE6invokeEPFvS3_llEPS2_ll($fn,$args,$args1,$args3) {
 $fn = $fn|0;
 $args = $args|0;
 $args1 = $args1|0;
 $args3 = $args3|0;
 var $call = 0, $call5 = 0, $call6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args)|0);
 $call5 = (__ZN10emscripten8internal11BindingTypeIlvE12fromWireTypeEl($args1)|0);
 $call6 = (__ZN10emscripten8internal11BindingTypeIlvE12fromWireTypeEl($args3)|0);
 FUNCTION_TABLE_viii[$fn & 3]($call,$call5,$call6);
 return;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStatellEE8getCountEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStatellEE8getTypesEv($this) {
 $this = $this|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvR6QStatellEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvR6QStatellEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (16|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (939|0);
}
function __ZN10emscripten8internal7InvokerIiJR6QStatelibEE6invokeEPFiS3_libEPS2_lib($fn,$args,$args1,$args3,$args5) {
 $fn = $fn|0;
 $args = $args|0;
 $args1 = $args1|0;
 $args3 = $args3|0;
 $args5 = $args5|0;
 var $call = 0, $call10 = 0, $call11 = 0, $call7 = 0, $call8 = 0, $call9 = 0, $ref$tmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $ref$tmp = sp;
 $call = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args)|0);
 $call7 = (__ZN10emscripten8internal11BindingTypeIlvE12fromWireTypeEl($args1)|0);
 $call8 = (__ZN10emscripten8internal11BindingTypeIivE12fromWireTypeEi($args3)|0);
 $call9 = (__ZN10emscripten8internal11BindingTypeIbvE12fromWireTypeEb($args5)|0);
 $call10 = (FUNCTION_TABLE_iiiii[$fn & 3]($call,$call7,$call8,$call9)|0);
 HEAP32[$ref$tmp>>2] = $call10;
 $call11 = (__ZN10emscripten8internal11BindingTypeIivE10toWireTypeERKi($ref$tmp)|0);
 STACKTOP = sp;return ($call11|0);
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiR6QStatelibEE8getCountEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiR6QStatelibEE8getTypesEv($this) {
 $this = $this|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJiR6QStatelibEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11BindingTypeIivE10toWireTypeERKi($v) {
 $v = $v|0;
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$v>>2]|0;
 return ($0|0);
}
function __ZN10emscripten8internal11BindingTypeIivE12fromWireTypeEi($v) {
 $v = $v|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($v|0);
}
function __ZN10emscripten8internal11BindingTypeIbvE12fromWireTypeEb($wt) {
 $wt = $wt|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($wt|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJiR6QStatelibEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (32|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (945|0);
}
function __ZN10emscripten8internal7InvokerIvJR6QStateEE6invokeEPFvS3_EPS2_($fn,$args) {
 $fn = $fn|0;
 $args = $args|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args)|0);
 FUNCTION_TABLE_vi[$fn & 15]($call);
 return;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStateEE8getCountEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStateEE8getTypesEv($this) {
 $this = $this|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvR6QStateEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvR6QStateEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (584|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (952|0);
}
function __ZN10emscripten8internal7InvokerIvJR6QStateRKS2_EE6invokeEPFvS3_S5_EPS2_S9_($fn,$args,$args1) {
 $fn = $fn|0;
 $args = $args|0;
 $args1 = $args1|0;
 var $call = 0, $call3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args)|0);
 $call3 = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args1)|0);
 FUNCTION_TABLE_vii[$fn & 7]($call,$call3);
 return;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStateRKS4_EE8getCountEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 3;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvR6QStateRKS4_EE8getTypesEv($this) {
 $this = $this|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvR6QStateRKS3_EEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvR6QStateRKS3_EEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (592|0);
}
function __ZN10emscripten8internal7InvokerIcJRK6QStateiiEE6invokeEPFcS4_iiEPS2_ii($fn,$args,$args1,$args3) {
 $fn = $fn|0;
 $args = $args|0;
 $args1 = $args1|0;
 $args3 = $args3|0;
 var $call = 0, $call5 = 0, $call6 = 0, $call7 = 0, $call8 = 0, $ref$tmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $ref$tmp = sp;
 $call = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args)|0);
 $call5 = (__ZN10emscripten8internal11BindingTypeIivE12fromWireTypeEi($args1)|0);
 $call6 = (__ZN10emscripten8internal11BindingTypeIivE12fromWireTypeEi($args3)|0);
 $call7 = (FUNCTION_TABLE_iiii[$fn & 7]($call,$call5,$call6)|0);
 HEAP8[$ref$tmp>>0] = $call7;
 $call8 = (__ZN10emscripten8internal11BindingTypeIcvE10toWireTypeERKc($ref$tmp)|0);
 STACKTOP = sp;return ($call8|0);
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJcRK6QStateiiEE8getCountEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJcRK6QStateiiEE8getTypesEv($this) {
 $this = $this|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJcRK6QStateiiEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11BindingTypeIcvE10toWireTypeERKc($v) {
 $v = $v|0;
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP8[$v>>0]|0;
 return ($0|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJcRK6QStateiiEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (64|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (956|0);
}
function __ZN10emscripten8internal7InvokerIcJRK6QStateiEE6invokeEPFcS4_iEPS2_i($fn,$args,$args1) {
 $fn = $fn|0;
 $args = $args|0;
 $args1 = $args1|0;
 var $call = 0, $call3 = 0, $call4 = 0, $call5 = 0, $ref$tmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $ref$tmp = sp;
 $call = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args)|0);
 $call3 = (__ZN10emscripten8internal11BindingTypeIivE12fromWireTypeEi($args1)|0);
 $call4 = (FUNCTION_TABLE_iii[$fn & 1]($call,$call3)|0);
 HEAP8[$ref$tmp>>0] = $call4;
 $call5 = (__ZN10emscripten8internal11BindingTypeIcvE10toWireTypeERKc($ref$tmp)|0);
 STACKTOP = sp;return ($call5|0);
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJcRK6QStateiEE8getCountEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 3;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJcRK6QStateiEE8getTypesEv($this) {
 $this = $this|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJcRK6QStateiEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJcRK6QStateiEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (604|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (962|0);
}
function __GLOBAL__sub_I_chp_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init();
 return;
}
function ___errno_location() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (2768|0);
}
function _strcmp($l,$r) {
 $l = $l|0;
 $r = $r|0;
 var $$lcssa = 0, $$lcssa6 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $cmp = 0, $cmp7 = 0, $conv5 = 0, $conv6 = 0, $incdec$ptr = 0, $incdec$ptr4 = 0, $l$addr$010 = 0, $or$cond = 0, $or$cond9 = 0, $r$addr$011 = 0, $sub = 0, $tobool = 0, $tobool8 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $0 = HEAP8[$l>>0]|0;
 $1 = HEAP8[$r>>0]|0;
 $cmp7 = ($0<<24>>24)!=($1<<24>>24);
 $tobool8 = ($0<<24>>24)==(0);
 $or$cond9 = $tobool8 | $cmp7;
 if ($or$cond9) {
  $$lcssa = $1;$$lcssa6 = $0;
 } else {
  $l$addr$010 = $l;$r$addr$011 = $r;
  while(1) {
   $incdec$ptr = ((($l$addr$010)) + 1|0);
   $incdec$ptr4 = ((($r$addr$011)) + 1|0);
   $2 = HEAP8[$incdec$ptr>>0]|0;
   $3 = HEAP8[$incdec$ptr4>>0]|0;
   $cmp = ($2<<24>>24)!=($3<<24>>24);
   $tobool = ($2<<24>>24)==(0);
   $or$cond = $tobool | $cmp;
   if ($or$cond) {
    $$lcssa = $3;$$lcssa6 = $2;
    break;
   } else {
    $l$addr$010 = $incdec$ptr;$r$addr$011 = $incdec$ptr4;
   }
  }
 }
 $conv5 = $$lcssa6&255;
 $conv6 = $$lcssa&255;
 $sub = (($conv5) - ($conv6))|0;
 return ($sub|0);
}
function _strlen($s) {
 $s = $s|0;
 var $$pn = 0, $$pn24 = 0, $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $and = 0, $and3 = 0, $incdec$ptr = 0, $incdec$ptr1323 = 0, $incdec$ptr7 = 0, $neg = 0, $rem = 0, $rem13 = 0, $retval$0 = 0, $s$addr$0$lcssa = 0, $s$addr$015 = 0;
 var $s$addr$1$lcssa = 0, $sub = 0, $sub$ptr$lhs$cast15 = 0, $tobool = 0, $tobool1 = 0, $tobool10 = 0, $tobool1021 = 0, $tobool14 = 0, $tobool4 = 0, $w$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $s;
 $rem13 = $0 & 3;
 $tobool14 = ($rem13|0)==(0);
 L1: do {
  if ($tobool14) {
   $s$addr$0$lcssa = $s;
   label = 5;
  } else {
   $5 = $0;$s$addr$015 = $s;
   while(1) {
    $1 = HEAP8[$s$addr$015>>0]|0;
    $tobool1 = ($1<<24>>24)==(0);
    if ($tobool1) {
     $$pn = $5;
     break L1;
    }
    $incdec$ptr = ((($s$addr$015)) + 1|0);
    $2 = $incdec$ptr;
    $rem = $2 & 3;
    $tobool = ($rem|0)==(0);
    if ($tobool) {
     $s$addr$0$lcssa = $incdec$ptr;
     label = 5;
     break;
    } else {
     $5 = $2;$s$addr$015 = $incdec$ptr;
    }
   }
  }
 } while(0);
 if ((label|0) == 5) {
  $w$0 = $s$addr$0$lcssa;
  while(1) {
   $3 = HEAP32[$w$0>>2]|0;
   $sub = (($3) + -16843009)|0;
   $neg = $3 & -2139062144;
   $and = $neg ^ -2139062144;
   $and3 = $and & $sub;
   $tobool4 = ($and3|0)==(0);
   $incdec$ptr7 = ((($w$0)) + 4|0);
   if ($tobool4) {
    $w$0 = $incdec$ptr7;
   } else {
    break;
   }
  }
  $4 = $3&255;
  $tobool1021 = ($4<<24>>24)==(0);
  if ($tobool1021) {
   $s$addr$1$lcssa = $w$0;
  } else {
   $$pn24 = $w$0;
   while(1) {
    $incdec$ptr1323 = ((($$pn24)) + 1|0);
    $$pre = HEAP8[$incdec$ptr1323>>0]|0;
    $tobool10 = ($$pre<<24>>24)==(0);
    if ($tobool10) {
     $s$addr$1$lcssa = $incdec$ptr1323;
     break;
    } else {
     $$pn24 = $incdec$ptr1323;
    }
   }
  }
  $sub$ptr$lhs$cast15 = $s$addr$1$lcssa;
  $$pn = $sub$ptr$lhs$cast15;
 }
 $retval$0 = (($$pn) - ($0))|0;
 return ($retval$0|0);
}
function ___strdup($s) {
 $s = $s|0;
 var $add = 0, $call = 0, $call1 = 0, $call3 = 0, $retval$0 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_strlen($s)|0);
 $add = (($call) + 1)|0;
 $call1 = (_malloc($add)|0);
 $tobool = ($call1|0)==(0|0);
 if ($tobool) {
  $retval$0 = 0;
 } else {
  $call3 = (_memcpy(($call1|0),($s|0),($add|0))|0);
  $retval$0 = $call3;
 }
 return ($retval$0|0);
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($this,$thrown_type,$adjustedPtr) {
 $this = $this|0;
 $thrown_type = $thrown_type|0;
 $adjustedPtr = $adjustedPtr|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $call = 0, $cmp = 0, $cmp6 = 0, $dst_ptr_leading_to_static_ptr = 0, $info = 0, $number_of_dst_type = 0, $path_dst_ptr_to_static_ptr = 0, $retval$0 = 0, $retval$2 = 0, $src2dst_offset = 0, $static_ptr = 0, $static_type = 0, $vfn = 0, $vtable = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $info = sp;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$thrown_type,0)|0);
 if ($call) {
  $retval$2 = 1;
 } else {
  $0 = ($thrown_type|0)==(0|0);
  if ($0) {
   $retval$2 = 0;
  } else {
   $1 = (___dynamic_cast($thrown_type,136,120,0)|0);
   $cmp = ($1|0)==(0|0);
   if ($cmp) {
    $retval$2 = 0;
   } else {
    HEAP32[$info>>2] = $1;
    $static_ptr = ((($info)) + 4|0);
    HEAP32[$static_ptr>>2] = 0;
    $static_type = ((($info)) + 8|0);
    HEAP32[$static_type>>2] = $this;
    $src2dst_offset = ((($info)) + 12|0);
    HEAP32[$src2dst_offset>>2] = -1;
    $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
    $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
    $number_of_dst_type = ((($info)) + 48|0);
    dest=$dst_ptr_leading_to_static_ptr; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$dst_ptr_leading_to_static_ptr+36>>1]=0|0;HEAP8[$dst_ptr_leading_to_static_ptr+38>>0]=0|0;
    HEAP32[$number_of_dst_type>>2] = 1;
    $vtable = HEAP32[$1>>2]|0;
    $vfn = ((($vtable)) + 28|0);
    $2 = HEAP32[$vfn>>2]|0;
    $3 = HEAP32[$adjustedPtr>>2]|0;
    FUNCTION_TABLE_viiii[$2 & 7]($1,$info,$3,1);
    $4 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
    $cmp6 = ($4|0)==(1);
    if ($cmp6) {
     $5 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
     HEAP32[$adjustedPtr>>2] = $5;
     $retval$0 = 1;
    } else {
     $retval$0 = 0;
    }
    $retval$2 = $retval$0;
   }
  }
 }
 STACKTOP = sp;return ($retval$2|0);
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($this,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $call = 0, $static_type = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$0,$use_strcmp)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$info,$dst_ptr,$current_ptr,$path_below);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $add = 0, $call = 0, $call3 = 0, $cmp = 0, $cmp12 = 0, $cmp13 = 0, $cmp5 = 0, $cmp7 = 0, $dst_ptr_leading_to_static_ptr = 0, $dst_ptr_not_leading_to_static_ptr = 0, $is_dst_type_derived_from_static_type = 0, $number_to_dst_ptr = 0, $number_to_static_ptr = 0;
 var $path_dst_ptr_to_static_ptr = 0, $path_dynamic_ptr_to_dst_ptr = 0, $path_dynamic_ptr_to_dst_ptr10 = 0, $search_done = 0, $static_type = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$0,$use_strcmp)|0);
 do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$info,$current_ptr,$path_below);
  } else {
   $1 = HEAP32[$info>>2]|0;
   $call3 = (__ZL8is_equalPKSt9type_infoS1_b($this,$1,$use_strcmp)|0);
   if ($call3) {
    $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
    $2 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
    $cmp = ($2|0)==($current_ptr|0);
    if (!($cmp)) {
     $dst_ptr_not_leading_to_static_ptr = ((($info)) + 20|0);
     $3 = HEAP32[$dst_ptr_not_leading_to_static_ptr>>2]|0;
     $cmp5 = ($3|0)==($current_ptr|0);
     if (!($cmp5)) {
      $path_dynamic_ptr_to_dst_ptr10 = ((($info)) + 32|0);
      HEAP32[$path_dynamic_ptr_to_dst_ptr10>>2] = $path_below;
      HEAP32[$dst_ptr_not_leading_to_static_ptr>>2] = $current_ptr;
      $number_to_dst_ptr = ((($info)) + 40|0);
      $4 = HEAP32[$number_to_dst_ptr>>2]|0;
      $add = (($4) + 1)|0;
      HEAP32[$number_to_dst_ptr>>2] = $add;
      $number_to_static_ptr = ((($info)) + 36|0);
      $5 = HEAP32[$number_to_static_ptr>>2]|0;
      $cmp12 = ($5|0)==(1);
      if ($cmp12) {
       $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
       $6 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
       $cmp13 = ($6|0)==(2);
       if ($cmp13) {
        $search_done = ((($info)) + 54|0);
        HEAP8[$search_done>>0] = 1;
       }
      }
      $is_dst_type_derived_from_static_type = ((($info)) + 44|0);
      HEAP32[$is_dst_type_derived_from_static_type>>2] = 4;
      break;
     }
    }
    $cmp7 = ($path_below|0)==(1);
    if ($cmp7) {
     $path_dynamic_ptr_to_dst_ptr = ((($info)) + 32|0);
     HEAP32[$path_dynamic_ptr_to_dst_ptr>>2] = 1;
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $call = 0, $static_type = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$0,0)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$info,$adjustedPtr,$path_below);
 }
 return;
}
function __ZL8is_equalPKSt9type_infoS1_b($x,$y,$use_strcmp) {
 $x = $x|0;
 $y = $y|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $__type_name$i = 0, $__type_name$i2 = 0, $call2 = 0, $cmp = 0, $cmp3 = 0, $retval$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 if ($use_strcmp) {
  $__type_name$i = ((($x)) + 4|0);
  $0 = HEAP32[$__type_name$i>>2]|0;
  $__type_name$i2 = ((($y)) + 4|0);
  $1 = HEAP32[$__type_name$i2>>2]|0;
  $call2 = (_strcmp($0,$1)|0);
  $cmp3 = ($call2|0)==(0);
  $retval$0 = $cmp3;
 } else {
  $cmp = ($x|0)==($y|0);
  $retval$0 = $cmp;
 }
 return ($retval$0|0);
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $2 = 0, $add = 0, $cmp = 0, $cmp4 = 0, $cmp7 = 0, $dst_ptr_leading_to_static_ptr = 0, $number_to_static_ptr = 0, $number_to_static_ptr11 = 0, $path_dst_ptr_to_static_ptr = 0, $path_dst_ptr_to_static_ptr12 = 0, $path_dst_ptr_to_static_ptr6 = 0, $search_done = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
 $0 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
 $cmp = ($0|0)==(0|0);
 do {
  if ($cmp) {
   HEAP32[$dst_ptr_leading_to_static_ptr>>2] = $adjustedPtr;
   $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
   HEAP32[$path_dst_ptr_to_static_ptr>>2] = $path_below;
   $number_to_static_ptr = ((($info)) + 36|0);
   HEAP32[$number_to_static_ptr>>2] = 1;
  } else {
   $cmp4 = ($0|0)==($adjustedPtr|0);
   if (!($cmp4)) {
    $number_to_static_ptr11 = ((($info)) + 36|0);
    $2 = HEAP32[$number_to_static_ptr11>>2]|0;
    $add = (($2) + 1)|0;
    HEAP32[$number_to_static_ptr11>>2] = $add;
    $path_dst_ptr_to_static_ptr12 = ((($info)) + 24|0);
    HEAP32[$path_dst_ptr_to_static_ptr12>>2] = 2;
    $search_done = ((($info)) + 54|0);
    HEAP8[$search_done>>0] = 1;
    break;
   }
   $path_dst_ptr_to_static_ptr6 = ((($info)) + 24|0);
   $1 = HEAP32[$path_dst_ptr_to_static_ptr6>>2]|0;
   $cmp7 = ($1|0)==(2);
   if ($cmp7) {
    HEAP32[$path_dst_ptr_to_static_ptr6>>2] = $path_below;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($this,$info,$current_ptr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $cmp = 0, $cmp2 = 0, $path_dynamic_ptr_to_static_ptr = 0, $static_ptr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_ptr = ((($info)) + 4|0);
 $0 = HEAP32[$static_ptr>>2]|0;
 $cmp = ($0|0)==($current_ptr|0);
 if ($cmp) {
  $path_dynamic_ptr_to_static_ptr = ((($info)) + 28|0);
  $1 = HEAP32[$path_dynamic_ptr_to_static_ptr>>2]|0;
  $cmp2 = ($1|0)==(1);
  if (!($cmp2)) {
   HEAP32[$path_dynamic_ptr_to_static_ptr>>2] = $path_below;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($this,$info,$dst_ptr,$current_ptr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $add = 0, $cmp = 0, $cmp10 = 0, $cmp13 = 0, $cmp18 = 0, $cmp2 = 0, $cmp21 = 0, $cmp5 = 0, $cmp7 = 0, $dst_ptr_leading_to_static_ptr = 0, $found_any_static_type = 0, $found_our_static_ptr = 0, $number_of_dst_type = 0;
 var $number_of_dst_type17 = 0, $number_to_static_ptr = 0, $number_to_static_ptr26 = 0, $or$cond = 0, $or$cond19 = 0, $path_dst_ptr_to_static_ptr = 0, $path_dst_ptr_to_static_ptr12 = 0, $search_done = 0, $search_done23 = 0, $search_done27 = 0, $static_ptr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $found_any_static_type = ((($info)) + 53|0);
 HEAP8[$found_any_static_type>>0] = 1;
 $static_ptr = ((($info)) + 4|0);
 $0 = HEAP32[$static_ptr>>2]|0;
 $cmp = ($0|0)==($current_ptr|0);
 do {
  if ($cmp) {
   $found_our_static_ptr = ((($info)) + 52|0);
   HEAP8[$found_our_static_ptr>>0] = 1;
   $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
   $1 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
   $cmp2 = ($1|0)==(0|0);
   if ($cmp2) {
    HEAP32[$dst_ptr_leading_to_static_ptr>>2] = $dst_ptr;
    $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
    HEAP32[$path_dst_ptr_to_static_ptr>>2] = $path_below;
    $number_to_static_ptr = ((($info)) + 36|0);
    HEAP32[$number_to_static_ptr>>2] = 1;
    $number_of_dst_type = ((($info)) + 48|0);
    $2 = HEAP32[$number_of_dst_type>>2]|0;
    $cmp5 = ($2|0)==(1);
    $cmp7 = ($path_below|0)==(1);
    $or$cond = $cmp7 & $cmp5;
    if (!($or$cond)) {
     break;
    }
    $search_done = ((($info)) + 54|0);
    HEAP8[$search_done>>0] = 1;
    break;
   }
   $cmp10 = ($1|0)==($dst_ptr|0);
   if (!($cmp10)) {
    $number_to_static_ptr26 = ((($info)) + 36|0);
    $6 = HEAP32[$number_to_static_ptr26>>2]|0;
    $add = (($6) + 1)|0;
    HEAP32[$number_to_static_ptr26>>2] = $add;
    $search_done27 = ((($info)) + 54|0);
    HEAP8[$search_done27>>0] = 1;
    break;
   }
   $path_dst_ptr_to_static_ptr12 = ((($info)) + 24|0);
   $3 = HEAP32[$path_dst_ptr_to_static_ptr12>>2]|0;
   $cmp13 = ($3|0)==(2);
   if ($cmp13) {
    HEAP32[$path_dst_ptr_to_static_ptr12>>2] = $path_below;
    $5 = $path_below;
   } else {
    $5 = $3;
   }
   $number_of_dst_type17 = ((($info)) + 48|0);
   $4 = HEAP32[$number_of_dst_type17>>2]|0;
   $cmp18 = ($4|0)==(1);
   $cmp21 = ($5|0)==(1);
   $or$cond19 = $cmp18 & $cmp21;
   if ($or$cond19) {
    $search_done23 = ((($info)) + 54|0);
    HEAP8[$search_done23>>0] = 1;
   }
  }
 } while(0);
 return;
}
function ___dynamic_cast($static_ptr,$static_type,$dst_type,$src2dst_offset) {
 $static_ptr = $static_ptr|0;
 $static_type = $static_type|0;
 $dst_type = $dst_type|0;
 $src2dst_offset = $src2dst_offset|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add$ptr = 0, $arrayidx = 0, $arrayidx1 = 0, $call = 0;
 var $cmp = 0, $cmp14 = 0, $cmp16 = 0, $cmp19 = 0, $cmp25 = 0, $cmp27 = 0, $cmp30 = 0, $cmp33 = 0, $dst_ptr$0 = 0, $dst_ptr_leading_to_static_ptr = 0, $dst_ptr_not_leading_to_static_ptr = 0, $info = 0, $number_of_dst_type = 0, $number_to_dst_ptr = 0, $number_to_static_ptr = 0, $or$cond = 0, $or$cond15 = 0, $or$cond16 = 0, $or$cond17 = 0, $path_dst_ptr_to_static_ptr = 0;
 var $path_dynamic_ptr_to_dst_ptr = 0, $path_dynamic_ptr_to_static_ptr = 0, $spec$select = 0, $spec$select18 = 0, $src2dst_offset5 = 0, $static_ptr3 = 0, $static_type4 = 0, $vfn = 0, $vfn11 = 0, $vtable10 = 0, $vtable7 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $info = sp;
 $0 = HEAP32[$static_ptr>>2]|0;
 $arrayidx = ((($0)) + -8|0);
 $1 = HEAP32[$arrayidx>>2]|0;
 $add$ptr = (($static_ptr) + ($1)|0);
 $arrayidx1 = ((($0)) + -4|0);
 $2 = HEAP32[$arrayidx1>>2]|0;
 HEAP32[$info>>2] = $dst_type;
 $static_ptr3 = ((($info)) + 4|0);
 HEAP32[$static_ptr3>>2] = $static_ptr;
 $static_type4 = ((($info)) + 8|0);
 HEAP32[$static_type4>>2] = $static_type;
 $src2dst_offset5 = ((($info)) + 12|0);
 HEAP32[$src2dst_offset5>>2] = $src2dst_offset;
 $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
 $dst_ptr_not_leading_to_static_ptr = ((($info)) + 20|0);
 $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
 $path_dynamic_ptr_to_static_ptr = ((($info)) + 28|0);
 $path_dynamic_ptr_to_dst_ptr = ((($info)) + 32|0);
 $number_to_dst_ptr = ((($info)) + 40|0);
 dest=$dst_ptr_leading_to_static_ptr; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$dst_ptr_leading_to_static_ptr+36>>1]=0|0;HEAP8[$dst_ptr_leading_to_static_ptr+38>>0]=0|0;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($2,$dst_type,0)|0);
 L1: do {
  if ($call) {
   $number_of_dst_type = ((($info)) + 48|0);
   HEAP32[$number_of_dst_type>>2] = 1;
   $vtable7 = HEAP32[$2>>2]|0;
   $vfn = ((($vtable7)) + 20|0);
   $3 = HEAP32[$vfn>>2]|0;
   FUNCTION_TABLE_viiiiii[$3 & 3]($2,$info,$add$ptr,$add$ptr,1,0);
   $4 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
   $cmp = ($4|0)==(1);
   $spec$select = $cmp ? $add$ptr : 0;
   $dst_ptr$0 = $spec$select;
  } else {
   $number_to_static_ptr = ((($info)) + 36|0);
   $vtable10 = HEAP32[$2>>2]|0;
   $vfn11 = ((($vtable10)) + 24|0);
   $5 = HEAP32[$vfn11>>2]|0;
   FUNCTION_TABLE_viiiii[$5 & 3]($2,$info,$add$ptr,1,0);
   $6 = HEAP32[$number_to_static_ptr>>2]|0;
   switch ($6|0) {
   case 0:  {
    $7 = HEAP32[$number_to_dst_ptr>>2]|0;
    $cmp14 = ($7|0)==(1);
    $8 = HEAP32[$path_dynamic_ptr_to_static_ptr>>2]|0;
    $cmp16 = ($8|0)==(1);
    $or$cond = $cmp14 & $cmp16;
    $9 = HEAP32[$path_dynamic_ptr_to_dst_ptr>>2]|0;
    $cmp19 = ($9|0)==(1);
    $or$cond15 = $or$cond & $cmp19;
    $10 = HEAP32[$dst_ptr_not_leading_to_static_ptr>>2]|0;
    $spec$select18 = $or$cond15 ? $10 : 0;
    $dst_ptr$0 = $spec$select18;
    break L1;
    break;
   }
   case 1:  {
    break;
   }
   default: {
    $dst_ptr$0 = 0;
    break L1;
   }
   }
   $11 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
   $cmp25 = ($11|0)==(1);
   if (!($cmp25)) {
    $12 = HEAP32[$number_to_dst_ptr>>2]|0;
    $cmp27 = ($12|0)==(0);
    $13 = HEAP32[$path_dynamic_ptr_to_static_ptr>>2]|0;
    $cmp30 = ($13|0)==(1);
    $or$cond16 = $cmp27 & $cmp30;
    $14 = HEAP32[$path_dynamic_ptr_to_dst_ptr>>2]|0;
    $cmp33 = ($14|0)==(1);
    $or$cond17 = $or$cond16 & $cmp33;
    if (!($or$cond17)) {
     $dst_ptr$0 = 0;
     break;
    }
   }
   $15 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
   $dst_ptr$0 = $15;
  }
 } while(0);
 STACKTOP = sp;return ($dst_ptr$0|0);
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($this,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, $__base_type = 0, $call = 0, $static_type = 0, $vfn = 0, $vtable = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$0,$use_strcmp)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$info,$dst_ptr,$current_ptr,$path_below);
 } else {
  $__base_type = ((($this)) + 8|0);
  $1 = HEAP32[$__base_type>>2]|0;
  $vtable = HEAP32[$1>>2]|0;
  $vfn = ((($vtable)) + 20|0);
  $2 = HEAP32[$vfn>>2]|0;
  FUNCTION_TABLE_viiiiii[$2 & 3]($1,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp);
 }
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__base_type = 0, $__base_type40 = 0, $add = 0, $call = 0, $call3 = 0, $cmp = 0;
 var $cmp11 = 0, $cmp33 = 0, $cmp34 = 0, $cmp5 = 0, $cmp7 = 0, $dst_ptr_leading_to_static_ptr = 0, $dst_ptr_not_leading_to_static_ptr = 0, $found_any_static_type = 0, $found_our_static_ptr = 0, $is_dst_type_derived_from_static_type = 0, $number_to_dst_ptr = 0, $number_to_static_ptr = 0, $path_dst_ptr_to_static_ptr = 0, $path_dynamic_ptr_to_dst_ptr = 0, $path_dynamic_ptr_to_dst_ptr10 = 0, $search_done = 0, $static_type = 0, $tobool16 = 0, $tobool19 = 0, $vfn = 0;
 var $vfn42 = 0, $vtable = 0, $vtable41 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$0,$use_strcmp)|0);
 L1: do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$info,$current_ptr,$path_below);
  } else {
   $1 = HEAP32[$info>>2]|0;
   $call3 = (__ZL8is_equalPKSt9type_infoS1_b($this,$1,$use_strcmp)|0);
   if (!($call3)) {
    $__base_type40 = ((($this)) + 8|0);
    $12 = HEAP32[$__base_type40>>2]|0;
    $vtable41 = HEAP32[$12>>2]|0;
    $vfn42 = ((($vtable41)) + 24|0);
    $13 = HEAP32[$vfn42>>2]|0;
    FUNCTION_TABLE_viiiii[$13 & 3]($12,$info,$current_ptr,$path_below,$use_strcmp);
    break;
   }
   $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
   $2 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
   $cmp = ($2|0)==($current_ptr|0);
   if (!($cmp)) {
    $dst_ptr_not_leading_to_static_ptr = ((($info)) + 20|0);
    $3 = HEAP32[$dst_ptr_not_leading_to_static_ptr>>2]|0;
    $cmp5 = ($3|0)==($current_ptr|0);
    if (!($cmp5)) {
     $path_dynamic_ptr_to_dst_ptr10 = ((($info)) + 32|0);
     HEAP32[$path_dynamic_ptr_to_dst_ptr10>>2] = $path_below;
     $is_dst_type_derived_from_static_type = ((($info)) + 44|0);
     $4 = HEAP32[$is_dst_type_derived_from_static_type>>2]|0;
     $cmp11 = ($4|0)==(4);
     do {
      if (!($cmp11)) {
       $found_our_static_ptr = ((($info)) + 52|0);
       HEAP8[$found_our_static_ptr>>0] = 0;
       $found_any_static_type = ((($info)) + 53|0);
       HEAP8[$found_any_static_type>>0] = 0;
       $__base_type = ((($this)) + 8|0);
       $5 = HEAP32[$__base_type>>2]|0;
       $vtable = HEAP32[$5>>2]|0;
       $vfn = ((($vtable)) + 20|0);
       $6 = HEAP32[$vfn>>2]|0;
       FUNCTION_TABLE_viiiiii[$6 & 3]($5,$info,$current_ptr,$current_ptr,1,$use_strcmp);
       $7 = HEAP8[$found_any_static_type>>0]|0;
       $tobool16 = ($7<<24>>24)==(0);
       if ($tobool16) {
        HEAP32[$is_dst_type_derived_from_static_type>>2] = 4;
        break;
       } else {
        $8 = HEAP8[$found_our_static_ptr>>0]|0;
        $tobool19 = ($8<<24>>24)==(0);
        HEAP32[$is_dst_type_derived_from_static_type>>2] = 3;
        if ($tobool19) {
         break;
        } else {
         break L1;
        }
       }
      }
     } while(0);
     HEAP32[$dst_ptr_not_leading_to_static_ptr>>2] = $current_ptr;
     $number_to_dst_ptr = ((($info)) + 40|0);
     $9 = HEAP32[$number_to_dst_ptr>>2]|0;
     $add = (($9) + 1)|0;
     HEAP32[$number_to_dst_ptr>>2] = $add;
     $number_to_static_ptr = ((($info)) + 36|0);
     $10 = HEAP32[$number_to_static_ptr>>2]|0;
     $cmp33 = ($10|0)==(1);
     if (!($cmp33)) {
      break;
     }
     $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
     $11 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
     $cmp34 = ($11|0)==(2);
     if (!($cmp34)) {
      break;
     }
     $search_done = ((($info)) + 54|0);
     HEAP8[$search_done>>0] = 1;
     break;
    }
   }
   $cmp7 = ($path_below|0)==(1);
   if ($cmp7) {
    $path_dynamic_ptr_to_dst_ptr = ((($info)) + 32|0);
    HEAP32[$path_dynamic_ptr_to_dst_ptr>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $2 = 0, $__base_type = 0, $call = 0, $static_type = 0, $vfn = 0, $vtable = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$0,0)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$info,$adjustedPtr,$path_below);
 } else {
  $__base_type = ((($this)) + 8|0);
  $1 = HEAP32[$__base_type>>2]|0;
  $vtable = HEAP32[$1>>2]|0;
  $vfn = ((($vtable)) + 28|0);
  $2 = HEAP32[$vfn>>2]|0;
  FUNCTION_TABLE_viiii[$2 & 7]($1,$info,$adjustedPtr,$path_below);
 }
 return;
}
function __ZdlPv($ptr) {
 $ptr = $ptr|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($ptr);
 return;
}
function __ZNSt9type_infoD2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv123__fundamental_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv($this,$thrown_type,$0) {
 $this = $this|0;
 $thrown_type = $thrown_type|0;
 $0 = $0|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$thrown_type,0)|0);
 return ($call|0);
}
function __ZN10__cxxabiv119__pointer_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv($this,$thrown_type,$adjustedPtr) {
 $this = $this|0;
 $thrown_type = $thrown_type|0;
 $adjustedPtr = $adjustedPtr|0;
 var $$pr = 0, $$pr36 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__flags = 0, $__flags13 = 0, $__pointee = 0, $__pointee25 = 0, $and = 0, $and14 = 0, $and20 = 0, $and21 = 0;
 var $call = 0, $call2 = 0, $call26 = 0, $call30 = 0, $call51 = 0, $call66 = 0, $cmp = 0, $cmp10 = 0, $cmp7 = 0, $cmp72 = 0, $cmp79 = 0, $cmp84 = 0, $cmp86 = 0, $dst_ptr_leading_to_static_ptr = 0, $info = 0, $neg = 0, $neg19 = 0, $neg45 = 0, $neg60 = 0, $number_of_dst_type = 0;
 var $path_dst_ptr_to_static_ptr = 0, $phitmp = 0, $retval$0 = 0, $retval$6 = 0, $src2dst_offset = 0, $static_ptr = 0, $static_type = 0, $tobool = 0, $tobool22 = 0, $tobool42 = 0, $tobool47 = 0, $tobool57 = 0, $tobool62 = 0, $vfn = 0, $vtable = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $info = sp;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($thrown_type,264,0)|0);
 do {
  if ($call) {
   HEAP32[$adjustedPtr>>2] = 0;
   $retval$6 = 1;
  } else {
   $call2 = (__ZNK10__cxxabiv117__pbase_type_info9can_catchEPKNS_16__shim_type_infoERPv($this,$thrown_type,0)|0);
   if ($call2) {
    $0 = HEAP32[$adjustedPtr>>2]|0;
    $cmp = ($0|0)==(0|0);
    if ($cmp) {
     $retval$6 = 1;
     break;
    }
    $1 = HEAP32[$0>>2]|0;
    HEAP32[$adjustedPtr>>2] = $1;
    $retval$6 = 1;
    break;
   }
   $2 = ($thrown_type|0)==(0|0);
   if ($2) {
    $retval$6 = 0;
   } else {
    $3 = (___dynamic_cast($thrown_type,136,192,0)|0);
    $cmp7 = ($3|0)==(0|0);
    if ($cmp7) {
     $retval$6 = 0;
    } else {
     $4 = HEAP32[$adjustedPtr>>2]|0;
     $cmp10 = ($4|0)==(0|0);
     if (!($cmp10)) {
      $5 = HEAP32[$4>>2]|0;
      HEAP32[$adjustedPtr>>2] = $5;
     }
     $__flags = ((($3)) + 8|0);
     $6 = HEAP32[$__flags>>2]|0;
     $__flags13 = ((($this)) + 8|0);
     $7 = HEAP32[$__flags13>>2]|0;
     $neg = $7 ^ 7;
     $and = $6 & 7;
     $and14 = $and & $neg;
     $tobool = ($and14|0)==(0);
     if ($tobool) {
      $neg19 = $6 & 96;
      $and20 = $neg19 ^ 96;
      $and21 = $and20 & $7;
      $tobool22 = ($and21|0)==(0);
      if ($tobool22) {
       $__pointee = ((($this)) + 12|0);
       $8 = HEAP32[$__pointee>>2]|0;
       $__pointee25 = ((($3)) + 12|0);
       $9 = HEAP32[$__pointee25>>2]|0;
       $call26 = (__ZL8is_equalPKSt9type_infoS1_b($8,$9,0)|0);
       if ($call26) {
        $retval$6 = 1;
       } else {
        $call30 = (__ZL8is_equalPKSt9type_infoS1_b($8,256,0)|0);
        if ($call30) {
         $10 = ($9|0)==(0|0);
         if ($10) {
          $retval$6 = 1;
          break;
         }
         $11 = (___dynamic_cast($9,136,208,0)|0);
         $phitmp = ($11|0)==(0|0);
         $retval$6 = $phitmp;
         break;
        }
        $12 = ($8|0)==(0|0);
        if ($12) {
         $retval$6 = 0;
        } else {
         $13 = (___dynamic_cast($8,136,192,0)|0);
         $tobool42 = ($13|0)==(0|0);
         if (!($tobool42)) {
          $14 = HEAP32[$__flags13>>2]|0;
          $neg45 = $14 & 1;
          $tobool47 = ($neg45|0)==(0);
          if ($tobool47) {
           $retval$6 = 0;
           break;
          }
          $15 = HEAP32[$__pointee25>>2]|0;
          $call51 = (__ZNK10__cxxabiv119__pointer_type_info16can_catch_nestedEPKNS_16__shim_type_infoE($13,$15)|0);
          $retval$6 = $call51;
          break;
         }
         $$pr = HEAP32[$__pointee>>2]|0;
         $16 = ($$pr|0)==(0|0);
         if ($16) {
          $retval$6 = 0;
         } else {
          $17 = (___dynamic_cast($$pr,136,224,0)|0);
          $tobool57 = ($17|0)==(0|0);
          if (!($tobool57)) {
           $18 = HEAP32[$__flags13>>2]|0;
           $neg60 = $18 & 1;
           $tobool62 = ($neg60|0)==(0);
           if ($tobool62) {
            $retval$6 = 0;
            break;
           }
           $19 = HEAP32[$__pointee25>>2]|0;
           $call66 = (__ZNK10__cxxabiv129__pointer_to_member_type_info16can_catch_nestedEPKNS_16__shim_type_infoE($17,$19)|0);
           $retval$6 = $call66;
           break;
          }
          $$pr36 = HEAP32[$__pointee>>2]|0;
          $20 = ($$pr36|0)==(0|0);
          if ($20) {
           $retval$6 = 0;
          } else {
           $21 = (___dynamic_cast($$pr36,136,120,0)|0);
           $cmp72 = ($21|0)==(0|0);
           if ($cmp72) {
            $retval$6 = 0;
           } else {
            $22 = HEAP32[$__pointee25>>2]|0;
            $23 = ($22|0)==(0|0);
            if ($23) {
             $retval$6 = 0;
            } else {
             $24 = (___dynamic_cast($22,136,120,0)|0);
             $cmp79 = ($24|0)==(0|0);
             if ($cmp79) {
              $retval$6 = 0;
             } else {
              HEAP32[$info>>2] = $24;
              $static_ptr = ((($info)) + 4|0);
              HEAP32[$static_ptr>>2] = 0;
              $static_type = ((($info)) + 8|0);
              HEAP32[$static_type>>2] = $21;
              $src2dst_offset = ((($info)) + 12|0);
              HEAP32[$src2dst_offset>>2] = -1;
              $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
              $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
              $number_of_dst_type = ((($info)) + 48|0);
              dest=$dst_ptr_leading_to_static_ptr; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$dst_ptr_leading_to_static_ptr+36>>1]=0|0;HEAP8[$dst_ptr_leading_to_static_ptr+38>>0]=0|0;
              HEAP32[$number_of_dst_type>>2] = 1;
              $vtable = HEAP32[$24>>2]|0;
              $vfn = ((($vtable)) + 28|0);
              $25 = HEAP32[$vfn>>2]|0;
              $26 = HEAP32[$adjustedPtr>>2]|0;
              FUNCTION_TABLE_viiii[$25 & 7]($24,$info,$26,1);
              $27 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
              $cmp84 = ($27|0)==(1);
              do {
               if ($cmp84) {
                $28 = HEAP32[$adjustedPtr>>2]|0;
                $cmp86 = ($28|0)==(0|0);
                if ($cmp86) {
                 $retval$0 = 1;
                 break;
                }
                $29 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
                HEAP32[$adjustedPtr>>2] = $29;
                $retval$0 = 1;
               } else {
                $retval$0 = 0;
               }
              } while(0);
              $retval$6 = $retval$0;
             }
            }
           }
          }
         }
        }
       }
      } else {
       $retval$6 = 0;
      }
     } else {
      $retval$6 = 0;
     }
    }
   }
  }
 } while(0);
 STACKTOP = sp;return ($retval$6|0);
}
function __ZNK10__cxxabiv117__pbase_type_info9can_catchEPKNS_16__shim_type_infoERPv($this,$thrown_type,$0) {
 $this = $this|0;
 $thrown_type = $thrown_type|0;
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $__flags = 0, $__flags5 = 0, $and = 0, $and6 = 0, $call = 0, $retval$1 = 0, $tobool = 0, $tobool3 = 0, $tobool7 = 0, $use_strcmp$1$off0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $__flags = ((($this)) + 8|0);
 $1 = HEAP32[$__flags>>2]|0;
 $and = $1 & 24;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $2 = ($thrown_type|0)==(0|0);
  if ($2) {
   $retval$1 = 0;
  } else {
   $3 = (___dynamic_cast($thrown_type,136,176,0)|0);
   $tobool3 = ($3|0)==(0|0);
   if ($tobool3) {
    $retval$1 = 0;
   } else {
    $__flags5 = ((($3)) + 8|0);
    $4 = HEAP32[$__flags5>>2]|0;
    $and6 = $4 & 24;
    $tobool7 = ($and6|0)!=(0);
    $use_strcmp$1$off0 = $tobool7;
    label = 5;
   }
  }
 } else {
  $use_strcmp$1$off0 = 1;
  label = 5;
 }
 if ((label|0) == 5) {
  $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$thrown_type,$use_strcmp$1$off0)|0);
  $retval$1 = $call;
 }
 return ($retval$1|0);
}
function __ZNK10__cxxabiv119__pointer_type_info16can_catch_nestedEPKNS_16__shim_type_infoE($this,$thrown_type) {
 $this = $this|0;
 $thrown_type = $thrown_type|0;
 var $$pr = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__flags = 0, $__flags2 = 0, $__pointee = 0, $__pointee5 = 0, $and = 0, $call = 0, $call30 = 0;
 var $cmp = 0, $neg = 0, $neg9 = 0, $or$cond = 0, $retval$2 = 0, $this$tr = 0, $thrown_type$tr = 0, $tobool = 0, $tobool11 = 0, $tobool18 = 0, $tobool27 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $this$tr = $this;$thrown_type$tr = $thrown_type;
 while(1) {
  $0 = ($thrown_type$tr|0)==(0|0);
  if ($0) {
   $retval$2 = 0;
   break;
  }
  $1 = (___dynamic_cast($thrown_type$tr,136,192,0)|0);
  $cmp = ($1|0)==(0|0);
  if ($cmp) {
   $retval$2 = 0;
   break;
  }
  $__flags = ((($1)) + 8|0);
  $2 = HEAP32[$__flags>>2]|0;
  $__flags2 = ((($this$tr)) + 8|0);
  $3 = HEAP32[$__flags2>>2]|0;
  $neg = $3 ^ -1;
  $and = $2 & $neg;
  $tobool = ($and|0)==(0);
  if (!($tobool)) {
   $retval$2 = 0;
   break;
  }
  $__pointee = ((($this$tr)) + 12|0);
  $4 = HEAP32[$__pointee>>2]|0;
  $__pointee5 = ((($1)) + 12|0);
  $5 = HEAP32[$__pointee5>>2]|0;
  $call = (__ZL8is_equalPKSt9type_infoS1_b($4,$5,0)|0);
  if ($call) {
   $retval$2 = 1;
   break;
  }
  $neg9 = $3 & 1;
  $tobool11 = ($neg9|0)==(0);
  $6 = ($4|0)==(0|0);
  $or$cond = $tobool11 | $6;
  if ($or$cond) {
   $retval$2 = 0;
   break;
  }
  $7 = (___dynamic_cast($4,136,192,0)|0);
  $tobool18 = ($7|0)==(0|0);
  if ($tobool18) {
   label = 9;
   break;
  }
  $8 = HEAP32[$__pointee5>>2]|0;
  $this$tr = $7;$thrown_type$tr = $8;
 }
 if ((label|0) == 9) {
  $$pr = HEAP32[$__pointee>>2]|0;
  $9 = ($$pr|0)==(0|0);
  if ($9) {
   $retval$2 = 0;
  } else {
   $10 = (___dynamic_cast($$pr,136,224,0)|0);
   $tobool27 = ($10|0)==(0|0);
   if ($tobool27) {
    $retval$2 = 0;
   } else {
    $11 = HEAP32[$__pointee5>>2]|0;
    $call30 = (__ZNK10__cxxabiv129__pointer_to_member_type_info16can_catch_nestedEPKNS_16__shim_type_infoE($10,$11)|0);
    $retval$2 = $call30;
   }
  }
 }
 return ($retval$2|0);
}
function __ZNK10__cxxabiv129__pointer_to_member_type_info16can_catch_nestedEPKNS_16__shim_type_infoE($this,$thrown_type) {
 $this = $this|0;
 $thrown_type = $thrown_type|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $__context = 0, $__context8 = 0, $__flags = 0, $__flags2 = 0, $__pointee = 0, $__pointee5 = 0, $and = 0, $call = 0, $call9 = 0, $cmp = 0, $neg = 0, $retval$0 = 0;
 var $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($thrown_type|0)==(0|0);
 if ($0) {
  $retval$0 = 0;
 } else {
  $1 = (___dynamic_cast($thrown_type,136,224,0)|0);
  $cmp = ($1|0)==(0|0);
  if ($cmp) {
   $retval$0 = 0;
  } else {
   $__flags = ((($this)) + 8|0);
   $2 = HEAP32[$__flags>>2]|0;
   $neg = $2 ^ -1;
   $__flags2 = ((($1)) + 8|0);
   $3 = HEAP32[$__flags2>>2]|0;
   $and = $3 & $neg;
   $tobool = ($and|0)==(0);
   if ($tobool) {
    $__pointee = ((($this)) + 12|0);
    $4 = HEAP32[$__pointee>>2]|0;
    $__pointee5 = ((($1)) + 12|0);
    $5 = HEAP32[$__pointee5>>2]|0;
    $call = (__ZL8is_equalPKSt9type_infoS1_b($4,$5,0)|0);
    if ($call) {
     $__context = ((($this)) + 16|0);
     $6 = HEAP32[$__context>>2]|0;
     $__context8 = ((($1)) + 16|0);
     $7 = HEAP32[$__context8>>2]|0;
     $call9 = (__ZL8is_equalPKSt9type_infoS1_b($6,$7,0)|0);
     $retval$0 = $call9;
    } else {
     $retval$0 = 0;
    }
   } else {
    $retval$0 = 0;
   }
  }
 }
 return ($retval$0|0);
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($this);
 __ZdlPv($this);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($this,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__base_count = 0, $__flags = 0, $add$ptr = 0, $and = 0;
 var $and44 = 0, $arraydecay = 0, $call = 0, $cmp = 0, $cmp33 = 0, $cmp70 = 0, $found_any_static_type$0 = 0, $found_any_static_type$1$off0 = 0, $found_any_static_type$1$off0$in = 0, $found_any_static_type5 = 0, $found_our_static_ptr$0 = 0, $found_our_static_ptr$1$off0 = 0, $found_our_static_ptr$1$off0$in = 0, $found_our_static_ptr2 = 0, $frombool74 = 0, $frombool77 = 0, $incdec$ptr = 0, $incdec$ptr69 = 0, $or2438 = 0, $or37 = 0;
 var $or5850 = 0, $or6651 = 0, $p$0 = 0, $path_dst_ptr_to_static_ptr = 0, $search_done = 0, $static_type = 0, $tobool28 = 0, $tobool31 = 0, $tobool36 = 0, $tobool41 = 0, $tobool45 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$0,$use_strcmp)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$info,$dst_ptr,$current_ptr,$path_below);
 } else {
  $found_our_static_ptr2 = ((($info)) + 52|0);
  $1 = HEAP8[$found_our_static_ptr2>>0]|0;
  $found_any_static_type5 = ((($info)) + 53|0);
  $2 = HEAP8[$found_any_static_type5>>0]|0;
  $arraydecay = ((($this)) + 16|0);
  $__base_count = ((($this)) + 12|0);
  $3 = HEAP32[$__base_count>>2]|0;
  $add$ptr = (((($this)) + 16|0) + ($3<<3)|0);
  HEAP8[$found_our_static_ptr2>>0] = 0;
  HEAP8[$found_any_static_type5>>0] = 0;
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($arraydecay,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp);
  $4 = HEAP8[$found_our_static_ptr2>>0]|0;
  $or37 = $4 | $1;
  $5 = HEAP8[$found_any_static_type5>>0]|0;
  $or2438 = $5 | $2;
  $cmp = ($3|0)>(1);
  L4: do {
   if ($cmp) {
    $incdec$ptr = ((($this)) + 24|0);
    $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
    $__flags = ((($this)) + 8|0);
    $search_done = ((($info)) + 54|0);
    $12 = $5;$9 = $4;$found_any_static_type$0 = $or2438;$found_our_static_ptr$0 = $or37;$p$0 = $incdec$ptr;
    while(1) {
     $6 = HEAP8[$search_done>>0]|0;
     $tobool28 = ($6<<24>>24)==(0);
     $7 = $found_any_static_type$0 & 1;
     $8 = $found_our_static_ptr$0 & 1;
     if (!($tobool28)) {
      $found_any_static_type$1$off0$in = $7;$found_our_static_ptr$1$off0$in = $8;
      break L4;
     }
     $tobool31 = ($9<<24>>24)==(0);
     if ($tobool31) {
      $tobool41 = ($12<<24>>24)==(0);
      if (!($tobool41)) {
       $13 = HEAP32[$__flags>>2]|0;
       $and44 = $13 & 1;
       $tobool45 = ($and44|0)==(0);
       if ($tobool45) {
        $found_any_static_type$1$off0$in = $7;$found_our_static_ptr$1$off0$in = $8;
        break L4;
       }
      }
     } else {
      $10 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
      $cmp33 = ($10|0)==(1);
      if ($cmp33) {
       $found_any_static_type$1$off0$in = $7;$found_our_static_ptr$1$off0$in = $8;
       break L4;
      }
      $11 = HEAP32[$__flags>>2]|0;
      $and = $11 & 2;
      $tobool36 = ($and|0)==(0);
      if ($tobool36) {
       $found_any_static_type$1$off0$in = $7;$found_our_static_ptr$1$off0$in = $8;
       break L4;
      }
     }
     HEAP8[$found_our_static_ptr2>>0] = 0;
     HEAP8[$found_any_static_type5>>0] = 0;
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($p$0,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp);
     $14 = HEAP8[$found_our_static_ptr2>>0]|0;
     $or5850 = $14 | $8;
     $15 = HEAP8[$found_any_static_type5>>0]|0;
     $or6651 = $15 | $7;
     $incdec$ptr69 = ((($p$0)) + 8|0);
     $cmp70 = ($incdec$ptr69>>>0)<($add$ptr>>>0);
     if ($cmp70) {
      $12 = $15;$9 = $14;$found_any_static_type$0 = $or6651;$found_our_static_ptr$0 = $or5850;$p$0 = $incdec$ptr69;
     } else {
      $found_any_static_type$1$off0$in = $or6651;$found_our_static_ptr$1$off0$in = $or5850;
      break;
     }
    }
   } else {
    $found_any_static_type$1$off0$in = $or2438;$found_our_static_ptr$1$off0$in = $or37;
   }
  } while(0);
  $found_our_static_ptr$1$off0 = ($found_our_static_ptr$1$off0$in<<24>>24)!=(0);
  $found_any_static_type$1$off0 = ($found_any_static_type$1$off0$in<<24>>24)!=(0);
  $frombool74 = $found_our_static_ptr$1$off0&1;
  HEAP8[$found_our_static_ptr2>>0] = $frombool74;
  $frombool77 = $found_any_static_type$1$off0&1;
  HEAP8[$found_any_static_type5>>0] = $frombool77;
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__base_count = 0, $__base_count63 = 0, $__flags34 = 0, $__flags72 = 0, $add = 0, $add$ptr = 0, $add$ptr64 = 0, $and = 0, $and35 = 0, $and73 = 0, $and88 = 0, $arraydecay = 0, $arraydecay62 = 0, $call = 0;
 var $call3 = 0, $cmp = 0, $cmp100 = 0, $cmp106 = 0, $cmp11 = 0, $cmp115 = 0, $cmp121 = 0, $cmp16 = 0, $cmp27 = 0, $cmp5 = 0, $cmp51 = 0, $cmp53 = 0, $cmp7 = 0, $cmp70 = 0, $cmp77 = 0, $cmp85 = 0, $cmp97 = 0, $does_dst_type_point_to_our_static_type$0 = 0, $does_dst_type_point_to_our_static_type$1 = 0, $does_dst_type_point_to_our_static_type$273 = 0;
 var $does_dst_type_point_to_our_static_type$274 = 0, $dst_ptr_leading_to_static_ptr = 0, $dst_ptr_not_leading_to_static_ptr = 0, $extract$t = 0, $found_any_static_type = 0, $found_our_static_ptr = 0, $incdec$ptr = 0, $incdec$ptr105 = 0, $incdec$ptr120 = 0, $incdec$ptr69 = 0, $incdec$ptr84 = 0, $is_dst_type_derived_from_static_type = 0, $is_dst_type_derived_from_static_type13$0$off0 = 0, $is_dst_type_derived_from_static_type13$1$off0 = 0, $number_to_dst_ptr = 0, $number_to_static_ptr = 0, $number_to_static_ptr76 = 0, $p$0 = 0, $p65$0 = 0, $p65$1 = 0;
 var $p65$2 = 0, $path_dst_ptr_to_static_ptr = 0, $path_dst_ptr_to_static_ptr52 = 0, $path_dst_ptr_to_static_ptr99 = 0, $path_dynamic_ptr_to_dst_ptr = 0, $path_dynamic_ptr_to_dst_ptr10 = 0, $search_done = 0, $search_done110 = 0, $search_done55 = 0, $search_done79 = 0, $search_done92 = 0, $static_type = 0, $tobool111 = 0, $tobool18 = 0, $tobool22 = 0, $tobool25 = 0, $tobool30 = 0, $tobool36 = 0, $tobool74 = 0, $tobool80 = 0;
 var $tobool89 = 0, $tobool93 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$0,$use_strcmp)|0);
 L1: do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$info,$current_ptr,$path_below);
  } else {
   $1 = HEAP32[$info>>2]|0;
   $call3 = (__ZL8is_equalPKSt9type_infoS1_b($this,$1,$use_strcmp)|0);
   if (!($call3)) {
    $arraydecay62 = ((($this)) + 16|0);
    $__base_count63 = ((($this)) + 12|0);
    $17 = HEAP32[$__base_count63>>2]|0;
    $add$ptr64 = (((($this)) + 16|0) + ($17<<3)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($arraydecay62,$info,$current_ptr,$path_below,$use_strcmp);
    $incdec$ptr69 = ((($this)) + 24|0);
    $cmp70 = ($17|0)>(1);
    if (!($cmp70)) {
     break;
    }
    $__flags72 = ((($this)) + 8|0);
    $18 = HEAP32[$__flags72>>2]|0;
    $and73 = $18 & 2;
    $tobool74 = ($and73|0)==(0);
    if ($tobool74) {
     $number_to_static_ptr76 = ((($info)) + 36|0);
     $19 = HEAP32[$number_to_static_ptr76>>2]|0;
     $cmp77 = ($19|0)==(1);
     if (!($cmp77)) {
      $and88 = $18 & 1;
      $tobool89 = ($and88|0)==(0);
      if ($tobool89) {
       $search_done110 = ((($info)) + 54|0);
       $p65$2 = $incdec$ptr69;
       while(1) {
        $24 = HEAP8[$search_done110>>0]|0;
        $tobool111 = ($24<<24>>24)==(0);
        if (!($tobool111)) {
         break L1;
        }
        $25 = HEAP32[$number_to_static_ptr76>>2]|0;
        $cmp115 = ($25|0)==(1);
        if ($cmp115) {
         break L1;
        }
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($p65$2,$info,$current_ptr,$path_below,$use_strcmp);
        $incdec$ptr120 = ((($p65$2)) + 8|0);
        $cmp121 = ($incdec$ptr120>>>0)<($add$ptr64>>>0);
        if ($cmp121) {
         $p65$2 = $incdec$ptr120;
        } else {
         break L1;
        }
       }
      }
      $path_dst_ptr_to_static_ptr99 = ((($info)) + 24|0);
      $search_done92 = ((($info)) + 54|0);
      $p65$1 = $incdec$ptr69;
      while(1) {
       $21 = HEAP8[$search_done92>>0]|0;
       $tobool93 = ($21<<24>>24)==(0);
       if (!($tobool93)) {
        break L1;
       }
       $22 = HEAP32[$number_to_static_ptr76>>2]|0;
       $cmp97 = ($22|0)==(1);
       if ($cmp97) {
        $23 = HEAP32[$path_dst_ptr_to_static_ptr99>>2]|0;
        $cmp100 = ($23|0)==(1);
        if ($cmp100) {
         break L1;
        }
       }
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($p65$1,$info,$current_ptr,$path_below,$use_strcmp);
       $incdec$ptr105 = ((($p65$1)) + 8|0);
       $cmp106 = ($incdec$ptr105>>>0)<($add$ptr64>>>0);
       if ($cmp106) {
        $p65$1 = $incdec$ptr105;
       } else {
        break L1;
       }
      }
     }
    }
    $search_done79 = ((($info)) + 54|0);
    $p65$0 = $incdec$ptr69;
    while(1) {
     $20 = HEAP8[$search_done79>>0]|0;
     $tobool80 = ($20<<24>>24)==(0);
     if (!($tobool80)) {
      break L1;
     }
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($p65$0,$info,$current_ptr,$path_below,$use_strcmp);
     $incdec$ptr84 = ((($p65$0)) + 8|0);
     $cmp85 = ($incdec$ptr84>>>0)<($add$ptr64>>>0);
     if ($cmp85) {
      $p65$0 = $incdec$ptr84;
     } else {
      break L1;
     }
    }
   }
   $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
   $2 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
   $cmp = ($2|0)==($current_ptr|0);
   if (!($cmp)) {
    $dst_ptr_not_leading_to_static_ptr = ((($info)) + 20|0);
    $3 = HEAP32[$dst_ptr_not_leading_to_static_ptr>>2]|0;
    $cmp5 = ($3|0)==($current_ptr|0);
    if (!($cmp5)) {
     $path_dynamic_ptr_to_dst_ptr10 = ((($info)) + 32|0);
     HEAP32[$path_dynamic_ptr_to_dst_ptr10>>2] = $path_below;
     $is_dst_type_derived_from_static_type = ((($info)) + 44|0);
     $4 = HEAP32[$is_dst_type_derived_from_static_type>>2]|0;
     $cmp11 = ($4|0)==(4);
     if (!($cmp11)) {
      $arraydecay = ((($this)) + 16|0);
      $__base_count = ((($this)) + 12|0);
      $5 = HEAP32[$__base_count>>2]|0;
      $add$ptr = (((($this)) + 16|0) + ($5<<3)|0);
      $found_our_static_ptr = ((($info)) + 52|0);
      $found_any_static_type = ((($info)) + 53|0);
      $search_done = ((($info)) + 54|0);
      $__flags34 = ((($this)) + 8|0);
      $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
      $does_dst_type_point_to_our_static_type$0 = 0;$is_dst_type_derived_from_static_type13$0$off0 = 0;$p$0 = $arraydecay;
      L33: while(1) {
       $cmp16 = ($p$0>>>0)<($add$ptr>>>0);
       if (!($cmp16)) {
        label = 18;
        break;
       }
       HEAP8[$found_our_static_ptr>>0] = 0;
       HEAP8[$found_any_static_type>>0] = 0;
       __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($p$0,$info,$current_ptr,$current_ptr,1,$use_strcmp);
       $6 = HEAP8[$search_done>>0]|0;
       $tobool18 = ($6<<24>>24)==(0);
       if (!($tobool18)) {
        label = 18;
        break;
       }
       $7 = HEAP8[$found_any_static_type>>0]|0;
       $tobool22 = ($7<<24>>24)==(0);
       do {
        if ($tobool22) {
         $does_dst_type_point_to_our_static_type$1 = $does_dst_type_point_to_our_static_type$0;$is_dst_type_derived_from_static_type13$1$off0 = $is_dst_type_derived_from_static_type13$0$off0;
        } else {
         $8 = HEAP8[$found_our_static_ptr>>0]|0;
         $tobool25 = ($8<<24>>24)==(0);
         if ($tobool25) {
          $11 = HEAP32[$__flags34>>2]|0;
          $and35 = $11 & 1;
          $tobool36 = ($and35|0)==(0);
          if ($tobool36) {
           $does_dst_type_point_to_our_static_type$274 = $does_dst_type_point_to_our_static_type$0;
           label = 19;
           break L33;
          } else {
           $does_dst_type_point_to_our_static_type$1 = $does_dst_type_point_to_our_static_type$0;$is_dst_type_derived_from_static_type13$1$off0 = 1;
           break;
          }
         }
         $9 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
         $cmp27 = ($9|0)==(1);
         if ($cmp27) {
          $does_dst_type_point_to_our_static_type$274 = 1;
          label = 19;
          break L33;
         }
         $10 = HEAP32[$__flags34>>2]|0;
         $and = $10 & 2;
         $tobool30 = ($and|0)==(0);
         if ($tobool30) {
          $does_dst_type_point_to_our_static_type$274 = 1;
          label = 19;
          break L33;
         } else {
          $does_dst_type_point_to_our_static_type$1 = 1;$is_dst_type_derived_from_static_type13$1$off0 = 1;
         }
        }
       } while(0);
       $incdec$ptr = ((($p$0)) + 8|0);
       $does_dst_type_point_to_our_static_type$0 = $does_dst_type_point_to_our_static_type$1;$is_dst_type_derived_from_static_type13$0$off0 = $is_dst_type_derived_from_static_type13$1$off0;$p$0 = $incdec$ptr;
      }
      if ((label|0) == 18) {
       if ($is_dst_type_derived_from_static_type13$0$off0) {
        $does_dst_type_point_to_our_static_type$274 = $does_dst_type_point_to_our_static_type$0;
        label = 19;
       } else {
        $12 = 4;$does_dst_type_point_to_our_static_type$273 = $does_dst_type_point_to_our_static_type$0;
       }
      }
      if ((label|0) == 19) {
       $12 = 3;$does_dst_type_point_to_our_static_type$273 = $does_dst_type_point_to_our_static_type$274;
      }
      HEAP32[$is_dst_type_derived_from_static_type>>2] = $12;
      $13 = $does_dst_type_point_to_our_static_type$273 & 1;
      $extract$t = ($13<<24>>24)==(0);
      if (!($extract$t)) {
       break;
      }
     }
     HEAP32[$dst_ptr_not_leading_to_static_ptr>>2] = $current_ptr;
     $number_to_dst_ptr = ((($info)) + 40|0);
     $14 = HEAP32[$number_to_dst_ptr>>2]|0;
     $add = (($14) + 1)|0;
     HEAP32[$number_to_dst_ptr>>2] = $add;
     $number_to_static_ptr = ((($info)) + 36|0);
     $15 = HEAP32[$number_to_static_ptr>>2]|0;
     $cmp51 = ($15|0)==(1);
     if (!($cmp51)) {
      break;
     }
     $path_dst_ptr_to_static_ptr52 = ((($info)) + 24|0);
     $16 = HEAP32[$path_dst_ptr_to_static_ptr52>>2]|0;
     $cmp53 = ($16|0)==(2);
     if (!($cmp53)) {
      break;
     }
     $search_done55 = ((($info)) + 54|0);
     HEAP8[$search_done55>>0] = 1;
     break;
    }
   }
   $cmp7 = ($path_below|0)==(1);
   if ($cmp7) {
    $path_dynamic_ptr_to_dst_ptr = ((($info)) + 32|0);
    HEAP32[$path_dynamic_ptr_to_dst_ptr>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $0 = 0, $1 = 0, $2 = 0, $__base_count = 0, $add$ptr = 0, $arraydecay = 0, $call = 0, $cmp = 0, $cmp7 = 0, $incdec$ptr = 0, $incdec$ptr6 = 0, $p$0 = 0, $search_done = 0, $static_type = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZL8is_equalPKSt9type_infoS1_b($this,$0,0)|0);
 L1: do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$info,$adjustedPtr,$path_below);
  } else {
   $arraydecay = ((($this)) + 16|0);
   $__base_count = ((($this)) + 12|0);
   $1 = HEAP32[$__base_count>>2]|0;
   $add$ptr = (((($this)) + 16|0) + ($1<<3)|0);
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($arraydecay,$info,$adjustedPtr,$path_below);
   $cmp = ($1|0)>(1);
   if ($cmp) {
    $incdec$ptr = ((($this)) + 24|0);
    $search_done = ((($info)) + 54|0);
    $p$0 = $incdec$ptr;
    while(1) {
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($p$0,$info,$adjustedPtr,$path_below);
     $2 = HEAP8[$search_done>>0]|0;
     $tobool = ($2<<24>>24)==(0);
     if (!($tobool)) {
      break L1;
     }
     $incdec$ptr6 = ((($p$0)) + 8|0);
     $cmp7 = ($incdec$ptr6>>>0)<($add$ptr>>>0);
     if ($cmp7) {
      $p$0 = $incdec$ptr6;
     } else {
      break;
     }
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($this,$info,$adjustedPtr,$path_below) {
 $this = $this|0;
 $info = $info|0;
 $adjustedPtr = $adjustedPtr|0;
 $path_below = $path_below|0;
 var $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $__offset_flags7$phi$trans$insert = 0, $add$ptr = 0, $add$ptr6 = 0, $and = 0, $and8 = 0, $cmp = 0, $cond = 0, $offset_to_base$0 = 0, $shr = 0, $tobool = 0, $tobool9 = 0, $vfn = 0, $vtable5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($adjustedPtr|0)==(0|0);
 $__offset_flags7$phi$trans$insert = ((($this)) + 4|0);
 $$pre = HEAP32[$__offset_flags7$phi$trans$insert>>2]|0;
 if ($cmp) {
  $offset_to_base$0 = 0;
 } else {
  $shr = $$pre >> 8;
  $and = $$pre & 1;
  $tobool = ($and|0)==(0);
  if ($tobool) {
   $offset_to_base$0 = $shr;
  } else {
   $0 = HEAP32[$adjustedPtr>>2]|0;
   $add$ptr = (($0) + ($shr)|0);
   $1 = HEAP32[$add$ptr>>2]|0;
   $offset_to_base$0 = $1;
  }
 }
 $2 = HEAP32[$this>>2]|0;
 $vtable5 = HEAP32[$2>>2]|0;
 $vfn = ((($vtable5)) + 28|0);
 $3 = HEAP32[$vfn>>2]|0;
 $add$ptr6 = (($adjustedPtr) + ($offset_to_base$0)|0);
 $and8 = $$pre & 2;
 $tobool9 = ($and8|0)==(0);
 $cond = $tobool9 ? 2 : $path_below;
 FUNCTION_TABLE_viiii[$3 & 7]($2,$info,$add$ptr6,$cond);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($this,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $dst_ptr = $dst_ptr|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $__offset_flags = 0, $add$ptr = 0, $add$ptr4 = 0, $and = 0, $and6 = 0, $cond = 0, $offset_to_base$0 = 0, $shr = 0, $tobool = 0, $tobool7 = 0, $vfn = 0, $vtable3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $__offset_flags = ((($this)) + 4|0);
 $0 = HEAP32[$__offset_flags>>2]|0;
 $shr = $0 >> 8;
 $and = $0 & 1;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $offset_to_base$0 = $shr;
 } else {
  $1 = HEAP32[$current_ptr>>2]|0;
  $add$ptr = (($1) + ($shr)|0);
  $2 = HEAP32[$add$ptr>>2]|0;
  $offset_to_base$0 = $2;
 }
 $3 = HEAP32[$this>>2]|0;
 $vtable3 = HEAP32[$3>>2]|0;
 $vfn = ((($vtable3)) + 20|0);
 $4 = HEAP32[$vfn>>2]|0;
 $add$ptr4 = (($current_ptr) + ($offset_to_base$0)|0);
 $and6 = $0 & 2;
 $tobool7 = ($and6|0)==(0);
 $cond = $tobool7 ? 2 : $path_below;
 FUNCTION_TABLE_viiiiii[$4 & 3]($3,$info,$dst_ptr,$add$ptr4,$cond,$use_strcmp);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $__offset_flags = 0, $add$ptr = 0, $add$ptr4 = 0, $and = 0, $and6 = 0, $cond = 0, $offset_to_base$0 = 0, $shr = 0, $tobool = 0, $tobool7 = 0, $vfn = 0, $vtable3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $__offset_flags = ((($this)) + 4|0);
 $0 = HEAP32[$__offset_flags>>2]|0;
 $shr = $0 >> 8;
 $and = $0 & 1;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $offset_to_base$0 = $shr;
 } else {
  $1 = HEAP32[$current_ptr>>2]|0;
  $add$ptr = (($1) + ($shr)|0);
  $2 = HEAP32[$add$ptr>>2]|0;
  $offset_to_base$0 = $2;
 }
 $3 = HEAP32[$this>>2]|0;
 $vtable3 = HEAP32[$3>>2]|0;
 $vfn = ((($vtable3)) + 24|0);
 $4 = HEAP32[$vfn>>2]|0;
 $add$ptr4 = (($current_ptr) + ($offset_to_base$0)|0);
 $and6 = $0 & 2;
 $tobool7 = ($and6|0)==(0);
 $cond = $tobool7 ? 2 : $path_below;
 FUNCTION_TABLE_viiiii[$4 & 3]($3,$info,$add$ptr4,$cond,$use_strcmp);
 return;
}
function __ZSt15get_new_handlerv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0);
}
function __Znwm($size) {
 $size = $size|0;
 var $call = 0, $call$lcssa = 0, $call2 = 0, $cmp = 0, $cmp1 = 0, $spec$store$select = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($size|0)==(0);
 $spec$store$select = $cmp ? 1 : $size;
 while(1) {
  $call = (_malloc($spec$store$select)|0);
  $cmp1 = ($call|0)==(0|0);
  if (!($cmp1)) {
   $call$lcssa = $call;
   break;
  }
  $call2 = (__ZSt15get_new_handlerv()|0);
  $tobool = ($call2|0)==(0|0);
  if ($tobool) {
   $call$lcssa = 0;
   break;
  }
  FUNCTION_TABLE_v[$call2 & 0]();
 }
 return ($call$lcssa|0);
}
function __GLOBAL__sub_I_bind_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init_80();
 return;
}
function ___cxx_global_var_init_80() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev(3268);
 return;
}
function __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev($this) {
 $this = $this|0;
 var $this$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $this$addr = sp;
 HEAP32[$this$addr>>2] = $this;
 ___embind_register_native_and_builtin_types();
 STACKTOP = sp;return;
}
function ___embind_register_native_and_builtin_types() {
 var $call = 0, $call1 = 0, $call2 = 0, $call3 = 0, $call4 = 0, $call5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIvvE3getEv()|0);
 __embind_register_void(($call|0),(1344|0));
 $call1 = (__ZN10emscripten8internal6TypeIDIbvE3getEv()|0);
 __embind_register_bool(($call1|0),(1349|0),1,1,0);
 __ZN12_GLOBAL__N_116register_integerIcEEvPKc(1354);
 __ZN12_GLOBAL__N_116register_integerIaEEvPKc(1359);
 __ZN12_GLOBAL__N_116register_integerIhEEvPKc(1371);
 __ZN12_GLOBAL__N_116register_integerIsEEvPKc(1385);
 __ZN12_GLOBAL__N_116register_integerItEEvPKc(1391);
 __ZN12_GLOBAL__N_116register_integerIiEEvPKc(1406);
 __ZN12_GLOBAL__N_116register_integerIjEEvPKc(1410);
 __ZN12_GLOBAL__N_116register_integerIlEEvPKc(1423);
 __ZN12_GLOBAL__N_116register_integerImEEvPKc(1428);
 __ZN12_GLOBAL__N_114register_floatIfEEvPKc(1442);
 __ZN12_GLOBAL__N_114register_floatIdEEvPKc(1448);
 $call2 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEvE3getEv()|0);
 __embind_register_std_string(($call2|0),(1455|0));
 $call3 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEvE3getEv()|0);
 __embind_register_std_string(($call3|0),(1467|0));
 $call4 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEvE3getEv()|0);
 __embind_register_std_wstring(($call4|0),4,(1500|0));
 $call5 = (__ZN10emscripten8internal6TypeIDINS_3valEvE3getEv()|0);
 __embind_register_emval(($call5|0),(1513|0));
 __ZN12_GLOBAL__N_120register_memory_viewIcEEvPKc(1529);
 __ZN12_GLOBAL__N_120register_memory_viewIaEEvPKc(1559);
 __ZN12_GLOBAL__N_120register_memory_viewIhEEvPKc(1596);
 __ZN12_GLOBAL__N_120register_memory_viewIsEEvPKc(1635);
 __ZN12_GLOBAL__N_120register_memory_viewItEEvPKc(1666);
 __ZN12_GLOBAL__N_120register_memory_viewIiEEvPKc(1706);
 __ZN12_GLOBAL__N_120register_memory_viewIjEEvPKc(1735);
 __ZN12_GLOBAL__N_120register_memory_viewIlEEvPKc(1773);
 __ZN12_GLOBAL__N_120register_memory_viewImEEvPKc(1803);
 __ZN12_GLOBAL__N_120register_memory_viewIaEEvPKc(1842);
 __ZN12_GLOBAL__N_120register_memory_viewIhEEvPKc(1874);
 __ZN12_GLOBAL__N_120register_memory_viewIsEEvPKc(1907);
 __ZN12_GLOBAL__N_120register_memory_viewItEEvPKc(1940);
 __ZN12_GLOBAL__N_120register_memory_viewIiEEvPKc(1974);
 __ZN12_GLOBAL__N_120register_memory_viewIjEEvPKc(2007);
 __ZN12_GLOBAL__N_120register_memory_viewIfEEvPKc(2041);
 __ZN12_GLOBAL__N_120register_memory_viewIdEEvPKc(2072);
 __ZN12_GLOBAL__N_120register_memory_viewIeEEvPKc(2104);
 return;
}
function __ZN10emscripten8internal6TypeIDIvvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIvE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDIbvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIbE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_116register_integerIcEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $conv = 0, $conv3 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDIcvE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 $conv = -128 << 24 >> 24;
 $conv3 = 127 << 24 >> 24;
 __embind_register_integer(($call|0),($0|0),1,($conv|0),($conv3|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_116register_integerIaEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $conv = 0, $conv3 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDIavE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 $conv = -128 << 24 >> 24;
 $conv3 = 127 << 24 >> 24;
 __embind_register_integer(($call|0),($0|0),1,($conv|0),($conv3|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_116register_integerIhEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $conv = 0, $conv3 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDIhvE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 $conv = 0;
 $conv3 = 255;
 __embind_register_integer(($call|0),($0|0),1,($conv|0),($conv3|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_116register_integerIsEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $conv = 0, $conv3 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDIsvE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 $conv = -32768 << 16 >> 16;
 $conv3 = 32767 << 16 >> 16;
 __embind_register_integer(($call|0),($0|0),2,($conv|0),($conv3|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_116register_integerItEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $conv = 0, $conv3 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDItvE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 $conv = 0;
 $conv3 = 65535;
 __embind_register_integer(($call|0),($0|0),2,($conv|0),($conv3|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_116register_integerIiEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDIivE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_integer(($call|0),($0|0),4,-2147483648,2147483647);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_116register_integerIjEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDIjvE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_integer(($call|0),($0|0),4,0,-1);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_116register_integerIlEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDIlvE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_integer(($call|0),($0|0),4,-2147483648,2147483647);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_116register_integerImEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDImvE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_integer(($call|0),($0|0),4,0,-1);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_114register_floatIfEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDIfvE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_float(($call|0),($0|0),4);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_114register_floatIdEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDIdvE3getEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_float(($call|0),($0|0),8);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINS_3valEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_120register_memory_viewIcEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIcEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIaEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIaEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIhEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIhEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIsEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIsEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewItEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewItEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexItEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIiEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIiEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIjEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIjEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIlEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIlEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewImEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewImEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexImEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIfEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIfEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIdEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIdEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIeEEvPKc($name) {
 $name = $name|0;
 var $0 = 0, $call = 0, $call1 = 0, $name$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $name$addr = sp;
 HEAP32[$name$addr>>2] = $name;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEvE3getEv()|0);
 $call1 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIeEENS_15TypedArrayIndexEv()|0);
 $0 = HEAP32[$name$addr>>2]|0;
 __embind_register_memory_view(($call|0),($call1|0),($0|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIeEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 7;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (384|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIdEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 7;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (392|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIfEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 6;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (400|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewImEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexImEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (408|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIlEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (416|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIjEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (424|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIiEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (432|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewItEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexItEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 3;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (440|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIsEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (448|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIhEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (456|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIaEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (464|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIcEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (472|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (480|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (488|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (520|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (544|0);
}
function __ZN10emscripten8internal6TypeIDIdvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIdE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIdE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (360|0);
}
function __ZN10emscripten8internal6TypeIDIfvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIfE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIfE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (352|0);
}
function __ZN10emscripten8internal6TypeIDImvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDImE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDImE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (344|0);
}
function __ZN10emscripten8internal6TypeIDIlvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIlE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIlE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (336|0);
}
function __ZN10emscripten8internal6TypeIDIjvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIjE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIjE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (328|0);
}
function __ZN10emscripten8internal6TypeIDIivE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIiE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIiE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (320|0);
}
function __ZN10emscripten8internal6TypeIDItvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDItE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDItE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (312|0);
}
function __ZN10emscripten8internal6TypeIDIsvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIsE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIsE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (304|0);
}
function __ZN10emscripten8internal6TypeIDIhvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIhE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIhE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (288|0);
}
function __ZN10emscripten8internal6TypeIDIavE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIaE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIaE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (296|0);
}
function __ZN10emscripten8internal6TypeIDIcvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIcE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIcE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (280|0);
}
function __ZN10emscripten8internal11LightTypeIDIbE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (272|0);
}
function __ZN10emscripten8internal11LightTypeIDIvE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (256|0);
}
function ___getTypeName($ti) {
 $ti = $ti|0;
 var $0 = 0, $1 = 0, $__type_name$i = 0, $call1 = 0, $this$addr$i = 0, $this1$i = 0, $ti$addr = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $this$addr$i = sp + 4|0;
 $ti$addr = sp;
 HEAP32[$ti$addr>>2] = $ti;
 $0 = HEAP32[$ti$addr>>2]|0;
 HEAP32[$this$addr$i>>2] = $0;
 $this1$i = HEAP32[$this$addr$i>>2]|0;
 $__type_name$i = ((($this1$i)) + 4|0);
 $1 = HEAP32[$__type_name$i>>2]|0;
 $call1 = (___strdup($1)|0);
 STACKTOP = sp;return ($call1|0);
}
function _malloc($bytes) {
 $bytes = $bytes|0;
 var $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i134 = 0, $$pre$i194 = 0, $$pre$i31$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i195Z2D = 0, $$pre$phi$i32$iZ2D = 0, $$pre$phi$iZ2D = 0, $$pre$phiZ2D = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0;
 var $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0;
 var $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0;
 var $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0;
 var $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0;
 var $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0;
 var $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0;
 var $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0;
 var $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $F$0$i$i = 0, $F104$0 = 0, $F197$0$i = 0, $F224$0$i$i = 0, $F290$0$i = 0, $I252$0$i$i = 0, $I316$0$i = 0, $I57$0$i$i = 0, $K105$010$i$i = 0;
 var $K305$08$i$i = 0, $K373$015$i = 0, $R$1$i = 0, $R$1$i$be = 0, $R$1$i$i = 0, $R$1$i$i$be = 0, $R$1$i$i$ph = 0, $R$1$i$ph = 0, $R$1$i183 = 0, $R$1$i183$be = 0, $R$1$i183$ph = 0, $R$3$i = 0, $R$3$i$i = 0, $R$3$i188 = 0, $RP$1$i = 0, $RP$1$i$be = 0, $RP$1$i$i = 0, $RP$1$i$i$be = 0, $RP$1$i$i$ph = 0, $RP$1$i$ph = 0;
 var $RP$1$i182 = 0, $RP$1$i182$be = 0, $RP$1$i182$ph = 0, $T$0$lcssa$i = 0, $T$0$lcssa$i$i = 0, $T$0$lcssa$i34$i = 0, $T$014$i = 0, $T$07$i$i = 0, $T$09$i$i = 0, $add$i = 0, $add$i$i = 0, $add$i135 = 0, $add$i155 = 0, $add$ptr = 0, $add$ptr$i = 0, $add$ptr$i$i = 0, $add$ptr$i$i$i = 0, $add$ptr$i141 = 0, $add$ptr$i174 = 0, $add$ptr$i2$i$i = 0;
 var $add$ptr$i35$i = 0, $add$ptr$i43$i = 0, $add$ptr$i57$i = 0, $add$ptr14$i$i = 0, $add$ptr15$i$i = 0, $add$ptr16$i$i = 0, $add$ptr166 = 0, $add$ptr169 = 0, $add$ptr17$i$i = 0, $add$ptr178 = 0, $add$ptr181$i = 0, $add$ptr182 = 0, $add$ptr189$i = 0, $add$ptr190$i = 0, $add$ptr193 = 0, $add$ptr199 = 0, $add$ptr2$i$i = 0, $add$ptr205$i$i = 0, $add$ptr212$i$i = 0, $add$ptr225$i = 0;
 var $add$ptr227$i = 0, $add$ptr24$i$i = 0, $add$ptr262$i = 0, $add$ptr269$i = 0, $add$ptr273$i = 0, $add$ptr282$i = 0, $add$ptr3$i$i = 0, $add$ptr30$i$i = 0, $add$ptr369$i$i = 0, $add$ptr4$i$i = 0, $add$ptr4$i$i$i = 0, $add$ptr4$i41$i = 0, $add$ptr4$i49$i = 0, $add$ptr441$i = 0, $add$ptr5$i$i = 0, $add$ptr6$i$i = 0, $add$ptr6$i$i$i = 0, $add$ptr6$i53$i = 0, $add$ptr7$i$i = 0, $add$ptr81$i$i = 0;
 var $add$ptr95 = 0, $add$ptr98 = 0, $add10$i = 0, $add101$i = 0, $add110$i = 0, $add13$i = 0, $add14$i = 0, $add140$i = 0, $add144 = 0, $add150$i = 0, $add17$i = 0, $add17$i158 = 0, $add177$i = 0, $add18$i = 0, $add19$i = 0, $add2 = 0, $add20$i = 0, $add206$i$i = 0, $add212$i = 0, $add215$i = 0;
 var $add22$i = 0, $add246$i = 0, $add26$i$i = 0, $add268$i = 0, $add269$i$i = 0, $add274$i$i = 0, $add278$i$i = 0, $add280$i$i = 0, $add283$i$i = 0, $add337$i = 0, $add342$i = 0, $add346$i = 0, $add348$i = 0, $add351$i = 0, $add46$i = 0, $add50 = 0, $add51$i = 0, $add54 = 0, $add54$i = 0, $add58 = 0;
 var $add62 = 0, $add64 = 0, $add74$i$i = 0, $add77$i = 0, $add78$i = 0, $add79$i$i = 0, $add8 = 0, $add82$i = 0, $add83$i$i = 0, $add85$i$i = 0, $add86$i = 0, $add88$i$i = 0, $add9$i = 0, $add90$i = 0, $add92$i = 0, $and = 0, $and$i = 0, $and$i$i = 0, $and$i$i$i = 0, $and$i14$i = 0;
 var $and$i152 = 0, $and$i36$i = 0, $and$i44$i = 0, $and100$i = 0, $and103$i = 0, $and104$i = 0, $and106 = 0, $and11$i = 0, $and119$i$i = 0, $and1197$i$i = 0, $and12$i = 0, $and13$i = 0, $and13$i$i = 0, $and133$i$i = 0, $and14 = 0, $and145 = 0, $and17$i = 0, $and194$i = 0, $and194$i191 = 0, $and199$i = 0;
 var $and209$i$i = 0, $and21$i = 0, $and21$i159 = 0, $and227$i$i = 0, $and236$i = 0, $and264$i$i = 0, $and268$i$i = 0, $and273$i$i = 0, $and282$i$i = 0, $and29$i = 0, $and292$i = 0, $and295$i$i = 0, $and3$i = 0, $and3$i$i = 0, $and3$i$i$i = 0, $and3$i39$i = 0, $and3$i47$i = 0, $and30$i = 0, $and318$i$i = 0, $and3185$i$i = 0;
 var $and32$i = 0, $and32$i$i = 0, $and33$i$i = 0, $and331$i = 0, $and336$i = 0, $and341$i = 0, $and350$i = 0, $and363$i = 0, $and37$i$i = 0, $and387$i = 0, $and38712$i = 0, $and4 = 0, $and40$i$i = 0, $and41 = 0, $and42$i = 0, $and43 = 0, $and46 = 0, $and49 = 0, $and49$i = 0, $and49$i$i = 0;
 var $and53 = 0, $and57 = 0, $and6$i = 0, $and6$i$i = 0, $and6$i13$i = 0, $and6$i18$i = 0, $and61 = 0, $and64$i = 0, $and68$i = 0, $and69$i$i = 0, $and7 = 0, $and73$i = 0, $and73$i$i = 0, $and74 = 0, $and77$i = 0, $and78$i$i = 0, $and8$i = 0, $and80$i = 0, $and81$i = 0, $and85$i = 0;
 var $and87$i$i = 0, $and89$i = 0, $and9$i = 0, $and96$i$i = 0, $arrayidx = 0, $arrayidx$i = 0, $arrayidx$i$i = 0, $arrayidx$i160 = 0, $arrayidx103 = 0, $arrayidx103$i$i = 0, $arrayidx106$i = 0, $arrayidx107$i$i = 0, $arrayidx113$i = 0, $arrayidx113$i173 = 0, $arrayidx121$i = 0, $arrayidx121$i$sink = 0, $arrayidx123$i$i = 0, $arrayidx126$i$i = 0, $arrayidx137$i = 0, $arrayidx143$i$i = 0;
 var $arrayidx148$i = 0, $arrayidx151$i = 0, $arrayidx151$i$i = 0, $arrayidx151$i$i$sink = 0, $arrayidx154$i = 0, $arrayidx155$i = 0, $arrayidx161$i = 0, $arrayidx165$i = 0, $arrayidx165$i185 = 0, $arrayidx178$i$i = 0, $arrayidx184$i = 0, $arrayidx184$i$i = 0, $arrayidx195$i$i = 0, $arrayidx196$i = 0, $arrayidx204$i = 0, $arrayidx212$i = 0, $arrayidx212$i$sink = 0, $arrayidx223$i$i = 0, $arrayidx228$i = 0, $arrayidx23$i = 0;
 var $arrayidx239$i = 0, $arrayidx245$i = 0, $arrayidx256$i = 0, $arrayidx27$i = 0, $arrayidx287$i$i = 0, $arrayidx289$i = 0, $arrayidx290$i$i = 0, $arrayidx325$i$i = 0, $arrayidx355$i = 0, $arrayidx358$i = 0, $arrayidx394$i = 0, $arrayidx40$i = 0, $arrayidx44$i = 0, $arrayidx61$i = 0, $arrayidx65$i = 0, $arrayidx66 = 0, $arrayidx71$i = 0, $arrayidx75$i = 0, $arrayidx91$i$i = 0, $arrayidx92$i$i = 0;
 var $arrayidx94$i = 0, $arrayidx94$i170 = 0, $arrayidx96$i$i = 0, $bk$i = 0, $bk$i$i = 0, $bk$i176 = 0, $bk$i26$i = 0, $bk102$i$i = 0, $bk122 = 0, $bk124 = 0, $bk139$i$i = 0, $bk145$i = 0, $bk158$i$i = 0, $bk161$i$i = 0, $bk18 = 0, $bk218$i = 0, $bk220$i = 0, $bk246$i$i = 0, $bk248$i$i = 0, $bk302$i$i = 0;
 var $bk311$i = 0, $bk313$i = 0, $bk338$i$i = 0, $bk357$i$i = 0, $bk360$i$i = 0, $bk370$i = 0, $bk407$i = 0, $bk429$i = 0, $bk432$i = 0, $bk55$i$i = 0, $bk56$i = 0, $bk67$i$i = 0, $bk74$i$i = 0, $bk85 = 0, $bk91$i$i = 0, $br$2$ph$i = 0, $call107$i = 0, $call131$i = 0, $call132$i = 0, $call275$i = 0;
 var $call37$i = 0, $call68$i = 0, $call83$i = 0, $child$i$i = 0, $child166$i$i = 0, $child289$i$i = 0, $child357$i = 0, $cmp = 0, $cmp$i = 0, $cmp$i$i$i = 0, $cmp$i12$i = 0, $cmp$i133 = 0, $cmp$i149 = 0, $cmp$i15$i = 0, $cmp$i3$i$i = 0, $cmp$i37$i = 0, $cmp$i45$i = 0, $cmp$i55$i = 0, $cmp1 = 0, $cmp1$i = 0;
 var $cmp10 = 0, $cmp100$i$i = 0, $cmp102$i = 0, $cmp104$i$i = 0, $cmp105$i = 0, $cmp106$i$i = 0, $cmp107$i = 0, $cmp108$i = 0, $cmp108$i$i = 0, $cmp114$i = 0, $cmp116$i = 0, $cmp118$i = 0, $cmp119$i = 0, $cmp12$i = 0, $cmp120$i$i = 0, $cmp120$i28$i = 0, $cmp1208$i$i = 0, $cmp123$i = 0, $cmp124$i$i = 0, $cmp126$i = 0;
 var $cmp127$i = 0, $cmp128 = 0, $cmp128$i = 0, $cmp128$i$i = 0, $cmp133$i = 0, $cmp135$i = 0, $cmp137$i = 0, $cmp138$i = 0, $cmp139 = 0, $cmp141$i = 0, $cmp144$i$i = 0, $cmp146 = 0, $cmp147$i = 0, $cmp14799$i = 0, $cmp15$i = 0, $cmp151$i = 0, $cmp152$i = 0, $cmp155$i = 0, $cmp156 = 0, $cmp156$i = 0;
 var $cmp156$i$i = 0, $cmp157$i = 0, $cmp159$i = 0, $cmp162 = 0, $cmp162$i = 0, $cmp162$i184 = 0, $cmp166$i = 0, $cmp168$i$i = 0, $cmp174$i = 0, $cmp180$i = 0, $cmp185$i = 0, $cmp185$i$i = 0, $cmp186 = 0, $cmp186$i = 0, $cmp19$i = 0, $cmp190$i = 0, $cmp191$i = 0, $cmp2$i$i = 0, $cmp2$i$i$i = 0, $cmp20$i$i = 0;
 var $cmp203$i = 0, $cmp205$i = 0, $cmp209$i = 0, $cmp21$i = 0, $cmp215$i$i = 0, $cmp217$i = 0, $cmp218$i = 0, $cmp224$i = 0, $cmp228$i = 0, $cmp229$i = 0, $cmp24$i = 0, $cmp24$i$i = 0, $cmp246$i = 0, $cmp254$i$i = 0, $cmp257$i = 0, $cmp258$i$i = 0, $cmp26$i = 0, $cmp265$i = 0, $cmp27$i$i = 0, $cmp28$i = 0;
 var $cmp28$i$i = 0, $cmp284$i = 0, $cmp29 = 0, $cmp3$i$i = 0, $cmp306$i$i = 0, $cmp31 = 0, $cmp319$i = 0, $cmp319$i$i = 0, $cmp3196$i$i = 0, $cmp32$i = 0, $cmp32$i138 = 0, $cmp323$i = 0, $cmp327$i$i = 0, $cmp34$i = 0, $cmp34$i$i = 0, $cmp35$i = 0, $cmp36$i = 0, $cmp36$i$i = 0, $cmp374$i = 0, $cmp38$i = 0;
 var $cmp38$i$i = 0, $cmp388$i = 0, $cmp38813$i = 0, $cmp396$i = 0, $cmp40$i = 0, $cmp43$i = 0, $cmp45$i = 0, $cmp46$i = 0, $cmp46$i$i = 0, $cmp49$i = 0, $cmp5 = 0, $cmp55$i = 0, $cmp55$i166 = 0, $cmp57$i = 0, $cmp57$i167 = 0, $cmp59$i$i = 0, $cmp60$i = 0, $cmp62$i = 0, $cmp63$i = 0, $cmp63$i$i = 0;
 var $cmp65$i = 0, $cmp66$i = 0, $cmp66$i140 = 0, $cmp69$i = 0, $cmp7$i$i = 0, $cmp70 = 0, $cmp72$i = 0, $cmp75$i$i = 0, $cmp76$i = 0, $cmp81$i = 0, $cmp85$i = 0, $cmp89$i = 0, $cmp9$i$i = 0, $cmp90$i = 0, $cmp91$i = 0, $cmp93$i = 0, $cmp95$i = 0, $cmp96$i = 0, $cmp97$i = 0, $cmp97$i$i = 0;
 var $cmp9716$i = 0, $cmp99 = 0, $cond = 0, $cond$i = 0, $cond$i$i = 0, $cond$i$i$i = 0, $cond$i17$i = 0, $cond$i40$i = 0, $cond$i48$i = 0, $cond1$i$i = 0, $cond115$i = 0, $cond115$i$i = 0, $cond13$i$i = 0, $cond15$i$i = 0, $cond2$i = 0, $cond3$i = 0, $cond315$i$i = 0, $cond383$i = 0, $cond4$i = 0, $fd$i = 0;
 var $fd$i$i = 0, $fd$i177 = 0, $fd103$i$i = 0, $fd123 = 0, $fd140$i$i = 0, $fd146$i = 0, $fd148$i$i = 0, $fd160$i$i = 0, $fd219$i = 0, $fd247$i$i = 0, $fd303$i$i = 0, $fd312$i = 0, $fd339$i$i = 0, $fd344$i$i = 0, $fd359$i$i = 0, $fd371$i = 0, $fd408$i = 0, $fd416$i = 0, $fd431$i = 0, $fd54$i$i = 0;
 var $fd57$i = 0, $fd68$i$i = 0, $fd69 = 0, $fd78$i$i = 0, $fd9 = 0, $fd92$i$i = 0, $head = 0, $head$i = 0, $head$i$i = 0, $head$i$i$i = 0, $head$i164 = 0, $head$i22$i = 0, $head$i42$i = 0, $head$i52$i = 0, $head118$i$i = 0, $head1186$i$i = 0, $head168 = 0, $head173 = 0, $head177 = 0, $head179 = 0;
 var $head179$i = 0, $head182$i = 0, $head187$i = 0, $head189$i = 0, $head195 = 0, $head198 = 0, $head208$i$i = 0, $head211$i$i = 0, $head23$i$i = 0, $head25 = 0, $head26$i$i = 0, $head265$i = 0, $head268$i = 0, $head271$i = 0, $head274$i = 0, $head279$i = 0, $head281$i = 0, $head29$i = 0, $head29$i$i = 0, $head317$i$i = 0;
 var $head3174$i$i = 0, $head32$i$i = 0, $head34$i$i = 0, $head386$i = 0, $head38611$i = 0, $head7$i$i = 0, $head7$i$i$i = 0, $head7$i54$i = 0, $head94 = 0, $head97 = 0, $head99$i = 0, $idx$0$i = 0, $index$i = 0, $index$i$i = 0, $index$i189 = 0, $index$i29$i = 0, $index288$i$i = 0, $index356$i = 0, $magic$i$i = 0, $nb$0 = 0;
 var $neg = 0, $neg$i = 0, $neg$i$i = 0, $neg$i137 = 0, $neg$i190 = 0, $neg103$i = 0, $neg13 = 0, $neg132$i$i = 0, $neg48$i = 0, $neg73 = 0, $next$i = 0, $next$i$i = 0, $next$i$i$i = 0, $next231$i = 0, $not$cmp141$i = 0, $oldfirst$0$i$i = 0, $or$cond$i = 0, $or$cond$i168 = 0, $or$cond1$i = 0, $or$cond1$i165 = 0;
 var $or$cond11$i = 0, $or$cond2$i = 0, $or$cond4$i = 0, $or$cond5$i = 0, $or$cond7$i = 0, $or$cond8$i = 0, $or$cond8$not$i = 0, $or$cond97$i = 0, $or$cond98$i = 0, $or$i = 0, $or$i$i = 0, $or$i$i$i = 0, $or$i169 = 0, $or$i51$i = 0, $or101$i$i = 0, $or110 = 0, $or167 = 0, $or172 = 0, $or176 = 0, $or178$i = 0;
 var $or180 = 0, $or183$i = 0, $or186$i = 0, $or188$i = 0, $or19$i$i = 0, $or194 = 0, $or197 = 0, $or204$i = 0, $or210$i$i = 0, $or22$i$i = 0, $or23 = 0, $or232$i$i = 0, $or26 = 0, $or264$i = 0, $or267$i = 0, $or270$i = 0, $or275$i = 0, $or278$i = 0, $or28$i$i = 0, $or280$i = 0;
 var $or297$i = 0, $or300$i$i = 0, $or33$i$i = 0, $or368$i = 0, $or40 = 0, $or44$i$i = 0, $or93 = 0, $or96 = 0, $parent$i = 0, $parent$i$i = 0, $parent$i175 = 0, $parent$i27$i = 0, $parent135$i = 0, $parent138$i$i = 0, $parent149$i = 0, $parent162$i$i = 0, $parent165$i$i = 0, $parent166$i = 0, $parent179$i$i = 0, $parent196$i$i = 0;
 var $parent226$i = 0, $parent240$i = 0, $parent257$i = 0, $parent301$i$i = 0, $parent337$i$i = 0, $parent361$i$i = 0, $parent369$i = 0, $parent406$i = 0, $parent433$i = 0, $qsize$0$i$i = 0, $retval$0 = 0, $rsize$0$i = 0, $rsize$0$i162 = 0, $rsize$1$i = 0, $rsize$3$i = 0, $rsize$4$lcssa$i = 0, $rsize$418$i = 0, $rsize$418$i$ph = 0, $rst$0$i = 0, $rst$1$i = 0;
 var $sflags193$i = 0, $sflags235$i = 0, $shl = 0, $shl$i = 0, $shl$i$i = 0, $shl$i153 = 0, $shl102 = 0, $shl105 = 0, $shl116$i$i = 0, $shl12 = 0, $shl127$i$i = 0, $shl131$i$i = 0, $shl15$i = 0, $shl18$i = 0, $shl192$i = 0, $shl195$i = 0, $shl198$i = 0, $shl22 = 0, $shl222$i$i = 0, $shl226$i$i = 0;
 var $shl265$i$i = 0, $shl270$i$i = 0, $shl276$i$i = 0, $shl279$i$i = 0, $shl288$i = 0, $shl291$i = 0, $shl294$i$i = 0, $shl31$i = 0, $shl316$i$i = 0, $shl326$i$i = 0, $shl333$i = 0, $shl338$i = 0, $shl344$i = 0, $shl347$i = 0, $shl35 = 0, $shl362$i = 0, $shl37 = 0, $shl384$i = 0, $shl39$i$i = 0, $shl395$i = 0;
 var $shl48$i$i = 0, $shl60$i = 0, $shl65 = 0, $shl70$i$i = 0, $shl72 = 0, $shl75$i$i = 0, $shl81$i$i = 0, $shl84$i$i = 0, $shl9$i = 0, $shl90 = 0, $shl95$i$i = 0, $shr = 0, $shr$i = 0, $shr$i$i = 0, $shr$i148 = 0, $shr$i25$i = 0, $shr101 = 0, $shr11$i = 0, $shr11$i156 = 0, $shr110$i$i = 0;
 var $shr12$i = 0, $shr124$i$i = 0, $shr15$i = 0, $shr16$i = 0, $shr16$i157 = 0, $shr19$i = 0, $shr194$i = 0, $shr20$i = 0, $shr214$i$i = 0, $shr253$i$i = 0, $shr263$i$i = 0, $shr267$i$i = 0, $shr27$i = 0, $shr272$i$i = 0, $shr277$i$i = 0, $shr281$i$i = 0, $shr283$i = 0, $shr3 = 0, $shr310$i$i = 0, $shr318$i = 0;
 var $shr323$i$i = 0, $shr330$i = 0, $shr335$i = 0, $shr340$i = 0, $shr345$i = 0, $shr349$i = 0, $shr378$i = 0, $shr392$i = 0, $shr4$i = 0, $shr42$i = 0, $shr45 = 0, $shr47 = 0, $shr48 = 0, $shr5$i = 0, $shr5$i151 = 0, $shr51 = 0, $shr52 = 0, $shr55 = 0, $shr56 = 0, $shr58$i$i = 0;
 var $shr59 = 0, $shr60 = 0, $shr63 = 0, $shr68$i$i = 0, $shr7$i = 0, $shr7$i154 = 0, $shr72$i = 0, $shr72$i$i = 0, $shr75$i = 0, $shr76$i = 0, $shr77$i$i = 0, $shr79$i = 0, $shr8$i = 0, $shr80$i = 0, $shr82$i$i = 0, $shr83$i = 0, $shr84$i = 0, $shr86$i$i = 0, $shr87$i = 0, $shr88$i = 0;
 var $shr91$i = 0, $size$i$i = 0, $size$i$i$i = 0, $size$i$i$le = 0, $size188$i = 0, $size188$i$le = 0, $size245$i = 0, $sizebits$0$i = 0, $sp$0$i$i = 0, $sp$0$i$i$i = 0, $sp$0112$i = 0, $sp$1111$i = 0, $spec$select$i = 0, $spec$select$i171 = 0, $spec$select1$i = 0, $spec$select2$i = 0, $spec$select5$i = 0, $spec$select9$i = 0, $spec$select96$i = 0, $ssize$2$ph$i = 0;
 var $sub = 0, $sub$i = 0, $sub$i$i = 0, $sub$i$i$i = 0, $sub$i136 = 0, $sub$i147 = 0, $sub$i16$i = 0, $sub$i38$i = 0, $sub$i46$i = 0, $sub$ptr$lhs$cast$i = 0, $sub$ptr$lhs$cast$i$i = 0, $sub$ptr$lhs$cast$i19$i = 0, $sub$ptr$rhs$cast$i = 0, $sub$ptr$rhs$cast$i$i = 0, $sub$ptr$rhs$cast$i20$i = 0, $sub$ptr$sub$i = 0, $sub$ptr$sub$i$i = 0, $sub$ptr$sub$i21$i = 0, $sub10$i = 0, $sub101$i = 0;
 var $sub112$i = 0, $sub113$i$i = 0, $sub118$i = 0, $sub12$i$i = 0, $sub14$i = 0, $sub16$i$i = 0, $sub160 = 0, $sub172$i = 0, $sub18$i$i = 0, $sub190 = 0, $sub2$i = 0, $sub22$i = 0, $sub260$i = 0, $sub262$i$i = 0, $sub266$i$i = 0, $sub271$i$i = 0, $sub275$i$i = 0, $sub30$i = 0, $sub31$i = 0, $sub313$i$i = 0;
 var $sub329$i = 0, $sub33$i = 0, $sub334$i = 0, $sub339$i = 0, $sub343$i = 0, $sub381$i = 0, $sub4$i = 0, $sub41$i = 0, $sub42 = 0, $sub44 = 0, $sub5$i$i = 0, $sub5$i$i$i = 0, $sub5$i50$i = 0, $sub50$i = 0, $sub6$i = 0, $sub63$i = 0, $sub67$i = 0, $sub67$i$i = 0, $sub70$i = 0, $sub71$i$i = 0;
 var $sub76$i$i = 0, $sub80$i$i = 0, $sub91 = 0, $sub99$i = 0, $t$0$i = 0, $t$0$i161 = 0, $t$2$i = 0, $t$4$i = 0, $t$517$i = 0, $t$517$i$ph = 0, $tbase$795$i = 0, $tobool$i$i = 0, $tobool107 = 0, $tobool195$i = 0, $tobool200$i = 0, $tobool228$i$i = 0, $tobool237$i = 0, $tobool293$i = 0, $tobool296$i$i = 0, $tobool30$i = 0;
 var $tobool364$i = 0, $tobool97$i$i = 0, $tsize$2647482$i = 0, $tsize$4$i = 0, $tsize$794$i = 0, $v$0$i = 0, $v$0$i163 = 0, $v$1$i = 0, $v$3$i = 0, $v$3$i204 = 0, $v$4$lcssa$i = 0, $v$419$i = 0, $v$419$i$ph = 0, $xor$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $magic$i$i = sp;
 $cmp = ($bytes>>>0)<(245);
 do {
  if ($cmp) {
   $cmp1 = ($bytes>>>0)<(11);
   $add2 = (($bytes) + 11)|0;
   $and = $add2 & -8;
   $cond = $cmp1 ? 16 : $and;
   $shr = $cond >>> 3;
   $0 = HEAP32[693]|0;
   $shr3 = $0 >>> $shr;
   $and4 = $shr3 & 3;
   $cmp5 = ($and4|0)==(0);
   if (!($cmp5)) {
    $neg = $shr3 & 1;
    $and7 = $neg ^ 1;
    $add8 = (($and7) + ($shr))|0;
    $shl = $add8 << 1;
    $arrayidx = (2812 + ($shl<<2)|0);
    $1 = ((($arrayidx)) + 8|0);
    $2 = HEAP32[$1>>2]|0;
    $fd9 = ((($2)) + 8|0);
    $3 = HEAP32[$fd9>>2]|0;
    $cmp10 = ($3|0)==($arrayidx|0);
    if ($cmp10) {
     $shl12 = 1 << $add8;
     $neg13 = $shl12 ^ -1;
     $and14 = $0 & $neg13;
     HEAP32[693] = $and14;
    } else {
     $bk18 = ((($3)) + 12|0);
     HEAP32[$bk18>>2] = $arrayidx;
     HEAP32[$1>>2] = $3;
    }
    $shl22 = $add8 << 3;
    $or23 = $shl22 | 3;
    $head = ((($2)) + 4|0);
    HEAP32[$head>>2] = $or23;
    $add$ptr = (($2) + ($shl22)|0);
    $head25 = ((($add$ptr)) + 4|0);
    $4 = HEAP32[$head25>>2]|0;
    $or26 = $4 | 1;
    HEAP32[$head25>>2] = $or26;
    $retval$0 = $fd9;
    STACKTOP = sp;return ($retval$0|0);
   }
   $5 = HEAP32[(2780)>>2]|0;
   $cmp29 = ($cond>>>0)>($5>>>0);
   if ($cmp29) {
    $cmp31 = ($shr3|0)==(0);
    if (!($cmp31)) {
     $shl35 = $shr3 << $shr;
     $shl37 = 2 << $shr;
     $sub = (0 - ($shl37))|0;
     $or40 = $shl37 | $sub;
     $and41 = $shl35 & $or40;
     $sub42 = (0 - ($and41))|0;
     $and43 = $and41 & $sub42;
     $sub44 = (($and43) + -1)|0;
     $shr45 = $sub44 >>> 12;
     $and46 = $shr45 & 16;
     $shr47 = $sub44 >>> $and46;
     $shr48 = $shr47 >>> 5;
     $and49 = $shr48 & 8;
     $add50 = $and49 | $and46;
     $shr51 = $shr47 >>> $and49;
     $shr52 = $shr51 >>> 2;
     $and53 = $shr52 & 4;
     $add54 = $add50 | $and53;
     $shr55 = $shr51 >>> $and53;
     $shr56 = $shr55 >>> 1;
     $and57 = $shr56 & 2;
     $add58 = $add54 | $and57;
     $shr59 = $shr55 >>> $and57;
     $shr60 = $shr59 >>> 1;
     $and61 = $shr60 & 1;
     $add62 = $add58 | $and61;
     $shr63 = $shr59 >>> $and61;
     $add64 = (($add62) + ($shr63))|0;
     $shl65 = $add64 << 1;
     $arrayidx66 = (2812 + ($shl65<<2)|0);
     $6 = ((($arrayidx66)) + 8|0);
     $7 = HEAP32[$6>>2]|0;
     $fd69 = ((($7)) + 8|0);
     $8 = HEAP32[$fd69>>2]|0;
     $cmp70 = ($8|0)==($arrayidx66|0);
     if ($cmp70) {
      $shl72 = 1 << $add64;
      $neg73 = $shl72 ^ -1;
      $and74 = $0 & $neg73;
      HEAP32[693] = $and74;
      $10 = $and74;
     } else {
      $bk85 = ((($8)) + 12|0);
      HEAP32[$bk85>>2] = $arrayidx66;
      HEAP32[$6>>2] = $8;
      $10 = $0;
     }
     $shl90 = $add64 << 3;
     $sub91 = (($shl90) - ($cond))|0;
     $or93 = $cond | 3;
     $head94 = ((($7)) + 4|0);
     HEAP32[$head94>>2] = $or93;
     $add$ptr95 = (($7) + ($cond)|0);
     $or96 = $sub91 | 1;
     $head97 = ((($add$ptr95)) + 4|0);
     HEAP32[$head97>>2] = $or96;
     $add$ptr98 = (($7) + ($shl90)|0);
     HEAP32[$add$ptr98>>2] = $sub91;
     $cmp99 = ($5|0)==(0);
     if (!($cmp99)) {
      $9 = HEAP32[(2792)>>2]|0;
      $shr101 = $5 >>> 3;
      $shl102 = $shr101 << 1;
      $arrayidx103 = (2812 + ($shl102<<2)|0);
      $shl105 = 1 << $shr101;
      $and106 = $10 & $shl105;
      $tobool107 = ($and106|0)==(0);
      if ($tobool107) {
       $or110 = $10 | $shl105;
       HEAP32[693] = $or110;
       $$pre = ((($arrayidx103)) + 8|0);
       $$pre$phiZ2D = $$pre;$F104$0 = $arrayidx103;
      } else {
       $11 = ((($arrayidx103)) + 8|0);
       $12 = HEAP32[$11>>2]|0;
       $$pre$phiZ2D = $11;$F104$0 = $12;
      }
      HEAP32[$$pre$phiZ2D>>2] = $9;
      $bk122 = ((($F104$0)) + 12|0);
      HEAP32[$bk122>>2] = $9;
      $fd123 = ((($9)) + 8|0);
      HEAP32[$fd123>>2] = $F104$0;
      $bk124 = ((($9)) + 12|0);
      HEAP32[$bk124>>2] = $arrayidx103;
     }
     HEAP32[(2780)>>2] = $sub91;
     HEAP32[(2792)>>2] = $add$ptr95;
     $retval$0 = $fd69;
     STACKTOP = sp;return ($retval$0|0);
    }
    $13 = HEAP32[(2776)>>2]|0;
    $cmp128 = ($13|0)==(0);
    if ($cmp128) {
     $nb$0 = $cond;
    } else {
     $sub$i = (0 - ($13))|0;
     $and$i = $13 & $sub$i;
     $sub2$i = (($and$i) + -1)|0;
     $shr$i = $sub2$i >>> 12;
     $and3$i = $shr$i & 16;
     $shr4$i = $sub2$i >>> $and3$i;
     $shr5$i = $shr4$i >>> 5;
     $and6$i = $shr5$i & 8;
     $add$i = $and6$i | $and3$i;
     $shr7$i = $shr4$i >>> $and6$i;
     $shr8$i = $shr7$i >>> 2;
     $and9$i = $shr8$i & 4;
     $add10$i = $add$i | $and9$i;
     $shr11$i = $shr7$i >>> $and9$i;
     $shr12$i = $shr11$i >>> 1;
     $and13$i = $shr12$i & 2;
     $add14$i = $add10$i | $and13$i;
     $shr15$i = $shr11$i >>> $and13$i;
     $shr16$i = $shr15$i >>> 1;
     $and17$i = $shr16$i & 1;
     $add18$i = $add14$i | $and17$i;
     $shr19$i = $shr15$i >>> $and17$i;
     $add20$i = (($add18$i) + ($shr19$i))|0;
     $arrayidx$i = (3076 + ($add20$i<<2)|0);
     $14 = HEAP32[$arrayidx$i>>2]|0;
     $head$i = ((($14)) + 4|0);
     $15 = HEAP32[$head$i>>2]|0;
     $and21$i = $15 & -8;
     $sub22$i = (($and21$i) - ($cond))|0;
     $rsize$0$i = $sub22$i;$t$0$i = $14;$v$0$i = $14;
     while(1) {
      $arrayidx23$i = ((($t$0$i)) + 16|0);
      $16 = HEAP32[$arrayidx23$i>>2]|0;
      $cmp$i = ($16|0)==(0|0);
      if ($cmp$i) {
       $arrayidx27$i = ((($t$0$i)) + 20|0);
       $17 = HEAP32[$arrayidx27$i>>2]|0;
       $cmp28$i = ($17|0)==(0|0);
       if ($cmp28$i) {
        break;
       } else {
        $cond4$i = $17;
       }
      } else {
       $cond4$i = $16;
      }
      $head29$i = ((($cond4$i)) + 4|0);
      $18 = HEAP32[$head29$i>>2]|0;
      $and30$i = $18 & -8;
      $sub31$i = (($and30$i) - ($cond))|0;
      $cmp32$i = ($sub31$i>>>0)<($rsize$0$i>>>0);
      $spec$select$i = $cmp32$i ? $sub31$i : $rsize$0$i;
      $spec$select1$i = $cmp32$i ? $cond4$i : $v$0$i;
      $rsize$0$i = $spec$select$i;$t$0$i = $cond4$i;$v$0$i = $spec$select1$i;
     }
     $add$ptr$i = (($v$0$i) + ($cond)|0);
     $cmp35$i = ($add$ptr$i>>>0)>($v$0$i>>>0);
     if ($cmp35$i) {
      $parent$i = ((($v$0$i)) + 24|0);
      $19 = HEAP32[$parent$i>>2]|0;
      $bk$i = ((($v$0$i)) + 12|0);
      $20 = HEAP32[$bk$i>>2]|0;
      $cmp40$i = ($20|0)==($v$0$i|0);
      do {
       if ($cmp40$i) {
        $arrayidx61$i = ((($v$0$i)) + 20|0);
        $22 = HEAP32[$arrayidx61$i>>2]|0;
        $cmp62$i = ($22|0)==(0|0);
        if ($cmp62$i) {
         $arrayidx65$i = ((($v$0$i)) + 16|0);
         $23 = HEAP32[$arrayidx65$i>>2]|0;
         $cmp66$i = ($23|0)==(0|0);
         if ($cmp66$i) {
          $R$3$i = 0;
          break;
         } else {
          $R$1$i$ph = $23;$RP$1$i$ph = $arrayidx65$i;
         }
        } else {
         $R$1$i$ph = $22;$RP$1$i$ph = $arrayidx61$i;
        }
        $R$1$i = $R$1$i$ph;$RP$1$i = $RP$1$i$ph;
        while(1) {
         $arrayidx71$i = ((($R$1$i)) + 20|0);
         $24 = HEAP32[$arrayidx71$i>>2]|0;
         $cmp72$i = ($24|0)==(0|0);
         if ($cmp72$i) {
          $arrayidx75$i = ((($R$1$i)) + 16|0);
          $25 = HEAP32[$arrayidx75$i>>2]|0;
          $cmp76$i = ($25|0)==(0|0);
          if ($cmp76$i) {
           break;
          } else {
           $R$1$i$be = $25;$RP$1$i$be = $arrayidx75$i;
          }
         } else {
          $R$1$i$be = $24;$RP$1$i$be = $arrayidx71$i;
         }
         $R$1$i = $R$1$i$be;$RP$1$i = $RP$1$i$be;
        }
        HEAP32[$RP$1$i>>2] = 0;
        $R$3$i = $R$1$i;
       } else {
        $fd$i = ((($v$0$i)) + 8|0);
        $21 = HEAP32[$fd$i>>2]|0;
        $bk56$i = ((($21)) + 12|0);
        HEAP32[$bk56$i>>2] = $20;
        $fd57$i = ((($20)) + 8|0);
        HEAP32[$fd57$i>>2] = $21;
        $R$3$i = $20;
       }
      } while(0);
      $cmp90$i = ($19|0)==(0|0);
      do {
       if (!($cmp90$i)) {
        $index$i = ((($v$0$i)) + 28|0);
        $26 = HEAP32[$index$i>>2]|0;
        $arrayidx94$i = (3076 + ($26<<2)|0);
        $27 = HEAP32[$arrayidx94$i>>2]|0;
        $cmp95$i = ($v$0$i|0)==($27|0);
        if ($cmp95$i) {
         HEAP32[$arrayidx94$i>>2] = $R$3$i;
         $cond2$i = ($R$3$i|0)==(0|0);
         if ($cond2$i) {
          $shl$i = 1 << $26;
          $neg$i = $shl$i ^ -1;
          $and103$i = $13 & $neg$i;
          HEAP32[(2776)>>2] = $and103$i;
          break;
         }
        } else {
         $arrayidx113$i = ((($19)) + 16|0);
         $28 = HEAP32[$arrayidx113$i>>2]|0;
         $cmp114$i = ($28|0)==($v$0$i|0);
         $arrayidx121$i = ((($19)) + 20|0);
         $arrayidx121$i$sink = $cmp114$i ? $arrayidx113$i : $arrayidx121$i;
         HEAP32[$arrayidx121$i$sink>>2] = $R$3$i;
         $cmp126$i = ($R$3$i|0)==(0|0);
         if ($cmp126$i) {
          break;
         }
        }
        $parent135$i = ((($R$3$i)) + 24|0);
        HEAP32[$parent135$i>>2] = $19;
        $arrayidx137$i = ((($v$0$i)) + 16|0);
        $29 = HEAP32[$arrayidx137$i>>2]|0;
        $cmp138$i = ($29|0)==(0|0);
        if (!($cmp138$i)) {
         $arrayidx148$i = ((($R$3$i)) + 16|0);
         HEAP32[$arrayidx148$i>>2] = $29;
         $parent149$i = ((($29)) + 24|0);
         HEAP32[$parent149$i>>2] = $R$3$i;
        }
        $arrayidx154$i = ((($v$0$i)) + 20|0);
        $30 = HEAP32[$arrayidx154$i>>2]|0;
        $cmp155$i = ($30|0)==(0|0);
        if (!($cmp155$i)) {
         $arrayidx165$i = ((($R$3$i)) + 20|0);
         HEAP32[$arrayidx165$i>>2] = $30;
         $parent166$i = ((($30)) + 24|0);
         HEAP32[$parent166$i>>2] = $R$3$i;
        }
       }
      } while(0);
      $cmp174$i = ($rsize$0$i>>>0)<(16);
      if ($cmp174$i) {
       $add177$i = (($rsize$0$i) + ($cond))|0;
       $or178$i = $add177$i | 3;
       $head179$i = ((($v$0$i)) + 4|0);
       HEAP32[$head179$i>>2] = $or178$i;
       $add$ptr181$i = (($v$0$i) + ($add177$i)|0);
       $head182$i = ((($add$ptr181$i)) + 4|0);
       $31 = HEAP32[$head182$i>>2]|0;
       $or183$i = $31 | 1;
       HEAP32[$head182$i>>2] = $or183$i;
      } else {
       $or186$i = $cond | 3;
       $head187$i = ((($v$0$i)) + 4|0);
       HEAP32[$head187$i>>2] = $or186$i;
       $or188$i = $rsize$0$i | 1;
       $head189$i = ((($add$ptr$i)) + 4|0);
       HEAP32[$head189$i>>2] = $or188$i;
       $add$ptr190$i = (($add$ptr$i) + ($rsize$0$i)|0);
       HEAP32[$add$ptr190$i>>2] = $rsize$0$i;
       $cmp191$i = ($5|0)==(0);
       if (!($cmp191$i)) {
        $32 = HEAP32[(2792)>>2]|0;
        $shr194$i = $5 >>> 3;
        $shl195$i = $shr194$i << 1;
        $arrayidx196$i = (2812 + ($shl195$i<<2)|0);
        $shl198$i = 1 << $shr194$i;
        $and199$i = $shl198$i & $0;
        $tobool200$i = ($and199$i|0)==(0);
        if ($tobool200$i) {
         $or204$i = $shl198$i | $0;
         HEAP32[693] = $or204$i;
         $$pre$i = ((($arrayidx196$i)) + 8|0);
         $$pre$phi$iZ2D = $$pre$i;$F197$0$i = $arrayidx196$i;
        } else {
         $33 = ((($arrayidx196$i)) + 8|0);
         $34 = HEAP32[$33>>2]|0;
         $$pre$phi$iZ2D = $33;$F197$0$i = $34;
        }
        HEAP32[$$pre$phi$iZ2D>>2] = $32;
        $bk218$i = ((($F197$0$i)) + 12|0);
        HEAP32[$bk218$i>>2] = $32;
        $fd219$i = ((($32)) + 8|0);
        HEAP32[$fd219$i>>2] = $F197$0$i;
        $bk220$i = ((($32)) + 12|0);
        HEAP32[$bk220$i>>2] = $arrayidx196$i;
       }
       HEAP32[(2780)>>2] = $rsize$0$i;
       HEAP32[(2792)>>2] = $add$ptr$i;
      }
      $add$ptr225$i = ((($v$0$i)) + 8|0);
      $retval$0 = $add$ptr225$i;
      STACKTOP = sp;return ($retval$0|0);
     } else {
      $nb$0 = $cond;
     }
    }
   } else {
    $nb$0 = $cond;
   }
  } else {
   $cmp139 = ($bytes>>>0)>(4294967231);
   if ($cmp139) {
    $nb$0 = -1;
   } else {
    $add144 = (($bytes) + 11)|0;
    $and145 = $add144 & -8;
    $35 = HEAP32[(2776)>>2]|0;
    $cmp146 = ($35|0)==(0);
    if ($cmp146) {
     $nb$0 = $and145;
    } else {
     $sub$i147 = (0 - ($and145))|0;
     $shr$i148 = $add144 >>> 8;
     $cmp$i149 = ($shr$i148|0)==(0);
     if ($cmp$i149) {
      $idx$0$i = 0;
     } else {
      $cmp1$i = ($and145>>>0)>(16777215);
      if ($cmp1$i) {
       $idx$0$i = 31;
      } else {
       $sub4$i = (($shr$i148) + 1048320)|0;
       $shr5$i151 = $sub4$i >>> 16;
       $and$i152 = $shr5$i151 & 8;
       $shl$i153 = $shr$i148 << $and$i152;
       $sub6$i = (($shl$i153) + 520192)|0;
       $shr7$i154 = $sub6$i >>> 16;
       $and8$i = $shr7$i154 & 4;
       $add$i155 = $and8$i | $and$i152;
       $shl9$i = $shl$i153 << $and8$i;
       $sub10$i = (($shl9$i) + 245760)|0;
       $shr11$i156 = $sub10$i >>> 16;
       $and12$i = $shr11$i156 & 2;
       $add13$i = $add$i155 | $and12$i;
       $sub14$i = (14 - ($add13$i))|0;
       $shl15$i = $shl9$i << $and12$i;
       $shr16$i157 = $shl15$i >>> 15;
       $add17$i158 = (($sub14$i) + ($shr16$i157))|0;
       $shl18$i = $add17$i158 << 1;
       $add19$i = (($add17$i158) + 7)|0;
       $shr20$i = $and145 >>> $add19$i;
       $and21$i159 = $shr20$i & 1;
       $add22$i = $and21$i159 | $shl18$i;
       $idx$0$i = $add22$i;
      }
     }
     $arrayidx$i160 = (3076 + ($idx$0$i<<2)|0);
     $36 = HEAP32[$arrayidx$i160>>2]|0;
     $cmp24$i = ($36|0)==(0|0);
     L79: do {
      if ($cmp24$i) {
       $rsize$3$i = $sub$i147;$t$2$i = 0;$v$3$i = 0;
       label = 61;
      } else {
       $cmp26$i = ($idx$0$i|0)==(31);
       $shr27$i = $idx$0$i >>> 1;
       $sub30$i = (25 - ($shr27$i))|0;
       $cond$i = $cmp26$i ? 0 : $sub30$i;
       $shl31$i = $and145 << $cond$i;
       $rsize$0$i162 = $sub$i147;$rst$0$i = 0;$sizebits$0$i = $shl31$i;$t$0$i161 = $36;$v$0$i163 = 0;
       while(1) {
        $head$i164 = ((($t$0$i161)) + 4|0);
        $37 = HEAP32[$head$i164>>2]|0;
        $and32$i = $37 & -8;
        $sub33$i = (($and32$i) - ($and145))|0;
        $cmp34$i = ($sub33$i>>>0)<($rsize$0$i162>>>0);
        if ($cmp34$i) {
         $cmp36$i = ($sub33$i|0)==(0);
         if ($cmp36$i) {
          $rsize$418$i$ph = 0;$t$517$i$ph = $t$0$i161;$v$419$i$ph = $t$0$i161;
          label = 65;
          break L79;
         } else {
          $rsize$1$i = $sub33$i;$v$1$i = $t$0$i161;
         }
        } else {
         $rsize$1$i = $rsize$0$i162;$v$1$i = $v$0$i163;
        }
        $arrayidx40$i = ((($t$0$i161)) + 20|0);
        $38 = HEAP32[$arrayidx40$i>>2]|0;
        $shr42$i = $sizebits$0$i >>> 31;
        $arrayidx44$i = (((($t$0$i161)) + 16|0) + ($shr42$i<<2)|0);
        $39 = HEAP32[$arrayidx44$i>>2]|0;
        $cmp45$i = ($38|0)==(0|0);
        $cmp46$i = ($38|0)==($39|0);
        $or$cond1$i165 = $cmp45$i | $cmp46$i;
        $rst$1$i = $or$cond1$i165 ? $rst$0$i : $38;
        $cmp49$i = ($39|0)==(0|0);
        $spec$select5$i = $sizebits$0$i << 1;
        if ($cmp49$i) {
         $rsize$3$i = $rsize$1$i;$t$2$i = $rst$1$i;$v$3$i = $v$1$i;
         label = 61;
         break;
        } else {
         $rsize$0$i162 = $rsize$1$i;$rst$0$i = $rst$1$i;$sizebits$0$i = $spec$select5$i;$t$0$i161 = $39;$v$0$i163 = $v$1$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 61) {
      $cmp55$i166 = ($t$2$i|0)==(0|0);
      $cmp57$i167 = ($v$3$i|0)==(0|0);
      $or$cond$i168 = $cmp55$i166 & $cmp57$i167;
      if ($or$cond$i168) {
       $shl60$i = 2 << $idx$0$i;
       $sub63$i = (0 - ($shl60$i))|0;
       $or$i169 = $shl60$i | $sub63$i;
       $and64$i = $or$i169 & $35;
       $cmp65$i = ($and64$i|0)==(0);
       if ($cmp65$i) {
        $nb$0 = $and145;
        break;
       }
       $sub67$i = (0 - ($and64$i))|0;
       $and68$i = $and64$i & $sub67$i;
       $sub70$i = (($and68$i) + -1)|0;
       $shr72$i = $sub70$i >>> 12;
       $and73$i = $shr72$i & 16;
       $shr75$i = $sub70$i >>> $and73$i;
       $shr76$i = $shr75$i >>> 5;
       $and77$i = $shr76$i & 8;
       $add78$i = $and77$i | $and73$i;
       $shr79$i = $shr75$i >>> $and77$i;
       $shr80$i = $shr79$i >>> 2;
       $and81$i = $shr80$i & 4;
       $add82$i = $add78$i | $and81$i;
       $shr83$i = $shr79$i >>> $and81$i;
       $shr84$i = $shr83$i >>> 1;
       $and85$i = $shr84$i & 2;
       $add86$i = $add82$i | $and85$i;
       $shr87$i = $shr83$i >>> $and85$i;
       $shr88$i = $shr87$i >>> 1;
       $and89$i = $shr88$i & 1;
       $add90$i = $add86$i | $and89$i;
       $shr91$i = $shr87$i >>> $and89$i;
       $add92$i = (($add90$i) + ($shr91$i))|0;
       $arrayidx94$i170 = (3076 + ($add92$i<<2)|0);
       $40 = HEAP32[$arrayidx94$i170>>2]|0;
       $t$4$i = $40;$v$3$i204 = 0;
      } else {
       $t$4$i = $t$2$i;$v$3$i204 = $v$3$i;
      }
      $cmp9716$i = ($t$4$i|0)==(0|0);
      if ($cmp9716$i) {
       $rsize$4$lcssa$i = $rsize$3$i;$v$4$lcssa$i = $v$3$i204;
      } else {
       $rsize$418$i$ph = $rsize$3$i;$t$517$i$ph = $t$4$i;$v$419$i$ph = $v$3$i204;
       label = 65;
      }
     }
     if ((label|0) == 65) {
      $rsize$418$i = $rsize$418$i$ph;$t$517$i = $t$517$i$ph;$v$419$i = $v$419$i$ph;
      while(1) {
       $head99$i = ((($t$517$i)) + 4|0);
       $41 = HEAP32[$head99$i>>2]|0;
       $and100$i = $41 & -8;
       $sub101$i = (($and100$i) - ($and145))|0;
       $cmp102$i = ($sub101$i>>>0)<($rsize$418$i>>>0);
       $spec$select$i171 = $cmp102$i ? $sub101$i : $rsize$418$i;
       $spec$select2$i = $cmp102$i ? $t$517$i : $v$419$i;
       $arrayidx106$i = ((($t$517$i)) + 16|0);
       $42 = HEAP32[$arrayidx106$i>>2]|0;
       $cmp107$i = ($42|0)==(0|0);
       if ($cmp107$i) {
        $arrayidx113$i173 = ((($t$517$i)) + 20|0);
        $43 = HEAP32[$arrayidx113$i173>>2]|0;
        $cond115$i = $43;
       } else {
        $cond115$i = $42;
       }
       $cmp97$i = ($cond115$i|0)==(0|0);
       if ($cmp97$i) {
        $rsize$4$lcssa$i = $spec$select$i171;$v$4$lcssa$i = $spec$select2$i;
        break;
       } else {
        $rsize$418$i = $spec$select$i171;$t$517$i = $cond115$i;$v$419$i = $spec$select2$i;
       }
      }
     }
     $cmp116$i = ($v$4$lcssa$i|0)==(0|0);
     if ($cmp116$i) {
      $nb$0 = $and145;
     } else {
      $44 = HEAP32[(2780)>>2]|0;
      $sub118$i = (($44) - ($and145))|0;
      $cmp119$i = ($rsize$4$lcssa$i>>>0)<($sub118$i>>>0);
      if ($cmp119$i) {
       $add$ptr$i174 = (($v$4$lcssa$i) + ($and145)|0);
       $cmp123$i = ($add$ptr$i174>>>0)>($v$4$lcssa$i>>>0);
       if ($cmp123$i) {
        $parent$i175 = ((($v$4$lcssa$i)) + 24|0);
        $45 = HEAP32[$parent$i175>>2]|0;
        $bk$i176 = ((($v$4$lcssa$i)) + 12|0);
        $46 = HEAP32[$bk$i176>>2]|0;
        $cmp128$i = ($46|0)==($v$4$lcssa$i|0);
        do {
         if ($cmp128$i) {
          $arrayidx151$i = ((($v$4$lcssa$i)) + 20|0);
          $48 = HEAP32[$arrayidx151$i>>2]|0;
          $cmp152$i = ($48|0)==(0|0);
          if ($cmp152$i) {
           $arrayidx155$i = ((($v$4$lcssa$i)) + 16|0);
           $49 = HEAP32[$arrayidx155$i>>2]|0;
           $cmp156$i = ($49|0)==(0|0);
           if ($cmp156$i) {
            $R$3$i188 = 0;
            break;
           } else {
            $R$1$i183$ph = $49;$RP$1$i182$ph = $arrayidx155$i;
           }
          } else {
           $R$1$i183$ph = $48;$RP$1$i182$ph = $arrayidx151$i;
          }
          $R$1$i183 = $R$1$i183$ph;$RP$1$i182 = $RP$1$i182$ph;
          while(1) {
           $arrayidx161$i = ((($R$1$i183)) + 20|0);
           $50 = HEAP32[$arrayidx161$i>>2]|0;
           $cmp162$i184 = ($50|0)==(0|0);
           if ($cmp162$i184) {
            $arrayidx165$i185 = ((($R$1$i183)) + 16|0);
            $51 = HEAP32[$arrayidx165$i185>>2]|0;
            $cmp166$i = ($51|0)==(0|0);
            if ($cmp166$i) {
             break;
            } else {
             $R$1$i183$be = $51;$RP$1$i182$be = $arrayidx165$i185;
            }
           } else {
            $R$1$i183$be = $50;$RP$1$i182$be = $arrayidx161$i;
           }
           $R$1$i183 = $R$1$i183$be;$RP$1$i182 = $RP$1$i182$be;
          }
          HEAP32[$RP$1$i182>>2] = 0;
          $R$3$i188 = $R$1$i183;
         } else {
          $fd$i177 = ((($v$4$lcssa$i)) + 8|0);
          $47 = HEAP32[$fd$i177>>2]|0;
          $bk145$i = ((($47)) + 12|0);
          HEAP32[$bk145$i>>2] = $46;
          $fd146$i = ((($46)) + 8|0);
          HEAP32[$fd146$i>>2] = $47;
          $R$3$i188 = $46;
         }
        } while(0);
        $cmp180$i = ($45|0)==(0|0);
        do {
         if ($cmp180$i) {
          $61 = $35;
         } else {
          $index$i189 = ((($v$4$lcssa$i)) + 28|0);
          $52 = HEAP32[$index$i189>>2]|0;
          $arrayidx184$i = (3076 + ($52<<2)|0);
          $53 = HEAP32[$arrayidx184$i>>2]|0;
          $cmp185$i = ($v$4$lcssa$i|0)==($53|0);
          if ($cmp185$i) {
           HEAP32[$arrayidx184$i>>2] = $R$3$i188;
           $cond3$i = ($R$3$i188|0)==(0|0);
           if ($cond3$i) {
            $shl192$i = 1 << $52;
            $neg$i190 = $shl192$i ^ -1;
            $and194$i191 = $35 & $neg$i190;
            HEAP32[(2776)>>2] = $and194$i191;
            $61 = $and194$i191;
            break;
           }
          } else {
           $arrayidx204$i = ((($45)) + 16|0);
           $54 = HEAP32[$arrayidx204$i>>2]|0;
           $cmp205$i = ($54|0)==($v$4$lcssa$i|0);
           $arrayidx212$i = ((($45)) + 20|0);
           $arrayidx212$i$sink = $cmp205$i ? $arrayidx204$i : $arrayidx212$i;
           HEAP32[$arrayidx212$i$sink>>2] = $R$3$i188;
           $cmp217$i = ($R$3$i188|0)==(0|0);
           if ($cmp217$i) {
            $61 = $35;
            break;
           }
          }
          $parent226$i = ((($R$3$i188)) + 24|0);
          HEAP32[$parent226$i>>2] = $45;
          $arrayidx228$i = ((($v$4$lcssa$i)) + 16|0);
          $55 = HEAP32[$arrayidx228$i>>2]|0;
          $cmp229$i = ($55|0)==(0|0);
          if (!($cmp229$i)) {
           $arrayidx239$i = ((($R$3$i188)) + 16|0);
           HEAP32[$arrayidx239$i>>2] = $55;
           $parent240$i = ((($55)) + 24|0);
           HEAP32[$parent240$i>>2] = $R$3$i188;
          }
          $arrayidx245$i = ((($v$4$lcssa$i)) + 20|0);
          $56 = HEAP32[$arrayidx245$i>>2]|0;
          $cmp246$i = ($56|0)==(0|0);
          if ($cmp246$i) {
           $61 = $35;
          } else {
           $arrayidx256$i = ((($R$3$i188)) + 20|0);
           HEAP32[$arrayidx256$i>>2] = $56;
           $parent257$i = ((($56)) + 24|0);
           HEAP32[$parent257$i>>2] = $R$3$i188;
           $61 = $35;
          }
         }
        } while(0);
        $cmp265$i = ($rsize$4$lcssa$i>>>0)<(16);
        L128: do {
         if ($cmp265$i) {
          $add268$i = (($rsize$4$lcssa$i) + ($and145))|0;
          $or270$i = $add268$i | 3;
          $head271$i = ((($v$4$lcssa$i)) + 4|0);
          HEAP32[$head271$i>>2] = $or270$i;
          $add$ptr273$i = (($v$4$lcssa$i) + ($add268$i)|0);
          $head274$i = ((($add$ptr273$i)) + 4|0);
          $57 = HEAP32[$head274$i>>2]|0;
          $or275$i = $57 | 1;
          HEAP32[$head274$i>>2] = $or275$i;
         } else {
          $or278$i = $and145 | 3;
          $head279$i = ((($v$4$lcssa$i)) + 4|0);
          HEAP32[$head279$i>>2] = $or278$i;
          $or280$i = $rsize$4$lcssa$i | 1;
          $head281$i = ((($add$ptr$i174)) + 4|0);
          HEAP32[$head281$i>>2] = $or280$i;
          $add$ptr282$i = (($add$ptr$i174) + ($rsize$4$lcssa$i)|0);
          HEAP32[$add$ptr282$i>>2] = $rsize$4$lcssa$i;
          $shr283$i = $rsize$4$lcssa$i >>> 3;
          $cmp284$i = ($rsize$4$lcssa$i>>>0)<(256);
          if ($cmp284$i) {
           $shl288$i = $shr283$i << 1;
           $arrayidx289$i = (2812 + ($shl288$i<<2)|0);
           $58 = HEAP32[693]|0;
           $shl291$i = 1 << $shr283$i;
           $and292$i = $58 & $shl291$i;
           $tobool293$i = ($and292$i|0)==(0);
           if ($tobool293$i) {
            $or297$i = $58 | $shl291$i;
            HEAP32[693] = $or297$i;
            $$pre$i194 = ((($arrayidx289$i)) + 8|0);
            $$pre$phi$i195Z2D = $$pre$i194;$F290$0$i = $arrayidx289$i;
           } else {
            $59 = ((($arrayidx289$i)) + 8|0);
            $60 = HEAP32[$59>>2]|0;
            $$pre$phi$i195Z2D = $59;$F290$0$i = $60;
           }
           HEAP32[$$pre$phi$i195Z2D>>2] = $add$ptr$i174;
           $bk311$i = ((($F290$0$i)) + 12|0);
           HEAP32[$bk311$i>>2] = $add$ptr$i174;
           $fd312$i = ((($add$ptr$i174)) + 8|0);
           HEAP32[$fd312$i>>2] = $F290$0$i;
           $bk313$i = ((($add$ptr$i174)) + 12|0);
           HEAP32[$bk313$i>>2] = $arrayidx289$i;
           break;
          }
          $shr318$i = $rsize$4$lcssa$i >>> 8;
          $cmp319$i = ($shr318$i|0)==(0);
          if ($cmp319$i) {
           $I316$0$i = 0;
          } else {
           $cmp323$i = ($rsize$4$lcssa$i>>>0)>(16777215);
           if ($cmp323$i) {
            $I316$0$i = 31;
           } else {
            $sub329$i = (($shr318$i) + 1048320)|0;
            $shr330$i = $sub329$i >>> 16;
            $and331$i = $shr330$i & 8;
            $shl333$i = $shr318$i << $and331$i;
            $sub334$i = (($shl333$i) + 520192)|0;
            $shr335$i = $sub334$i >>> 16;
            $and336$i = $shr335$i & 4;
            $add337$i = $and336$i | $and331$i;
            $shl338$i = $shl333$i << $and336$i;
            $sub339$i = (($shl338$i) + 245760)|0;
            $shr340$i = $sub339$i >>> 16;
            $and341$i = $shr340$i & 2;
            $add342$i = $add337$i | $and341$i;
            $sub343$i = (14 - ($add342$i))|0;
            $shl344$i = $shl338$i << $and341$i;
            $shr345$i = $shl344$i >>> 15;
            $add346$i = (($sub343$i) + ($shr345$i))|0;
            $shl347$i = $add346$i << 1;
            $add348$i = (($add346$i) + 7)|0;
            $shr349$i = $rsize$4$lcssa$i >>> $add348$i;
            $and350$i = $shr349$i & 1;
            $add351$i = $and350$i | $shl347$i;
            $I316$0$i = $add351$i;
           }
          }
          $arrayidx355$i = (3076 + ($I316$0$i<<2)|0);
          $index356$i = ((($add$ptr$i174)) + 28|0);
          HEAP32[$index356$i>>2] = $I316$0$i;
          $child357$i = ((($add$ptr$i174)) + 16|0);
          $arrayidx358$i = ((($child357$i)) + 4|0);
          HEAP32[$arrayidx358$i>>2] = 0;
          HEAP32[$child357$i>>2] = 0;
          $shl362$i = 1 << $I316$0$i;
          $and363$i = $61 & $shl362$i;
          $tobool364$i = ($and363$i|0)==(0);
          if ($tobool364$i) {
           $or368$i = $61 | $shl362$i;
           HEAP32[(2776)>>2] = $or368$i;
           HEAP32[$arrayidx355$i>>2] = $add$ptr$i174;
           $parent369$i = ((($add$ptr$i174)) + 24|0);
           HEAP32[$parent369$i>>2] = $arrayidx355$i;
           $bk370$i = ((($add$ptr$i174)) + 12|0);
           HEAP32[$bk370$i>>2] = $add$ptr$i174;
           $fd371$i = ((($add$ptr$i174)) + 8|0);
           HEAP32[$fd371$i>>2] = $add$ptr$i174;
           break;
          }
          $62 = HEAP32[$arrayidx355$i>>2]|0;
          $head38611$i = ((($62)) + 4|0);
          $63 = HEAP32[$head38611$i>>2]|0;
          $and38712$i = $63 & -8;
          $cmp38813$i = ($and38712$i|0)==($rsize$4$lcssa$i|0);
          L145: do {
           if ($cmp38813$i) {
            $T$0$lcssa$i = $62;
           } else {
            $cmp374$i = ($I316$0$i|0)==(31);
            $shr378$i = $I316$0$i >>> 1;
            $sub381$i = (25 - ($shr378$i))|0;
            $cond383$i = $cmp374$i ? 0 : $sub381$i;
            $shl384$i = $rsize$4$lcssa$i << $cond383$i;
            $K373$015$i = $shl384$i;$T$014$i = $62;
            while(1) {
             $shr392$i = $K373$015$i >>> 31;
             $arrayidx394$i = (((($T$014$i)) + 16|0) + ($shr392$i<<2)|0);
             $64 = HEAP32[$arrayidx394$i>>2]|0;
             $cmp396$i = ($64|0)==(0|0);
             if ($cmp396$i) {
              break;
             }
             $shl395$i = $K373$015$i << 1;
             $head386$i = ((($64)) + 4|0);
             $65 = HEAP32[$head386$i>>2]|0;
             $and387$i = $65 & -8;
             $cmp388$i = ($and387$i|0)==($rsize$4$lcssa$i|0);
             if ($cmp388$i) {
              $T$0$lcssa$i = $64;
              break L145;
             } else {
              $K373$015$i = $shl395$i;$T$014$i = $64;
             }
            }
            HEAP32[$arrayidx394$i>>2] = $add$ptr$i174;
            $parent406$i = ((($add$ptr$i174)) + 24|0);
            HEAP32[$parent406$i>>2] = $T$014$i;
            $bk407$i = ((($add$ptr$i174)) + 12|0);
            HEAP32[$bk407$i>>2] = $add$ptr$i174;
            $fd408$i = ((($add$ptr$i174)) + 8|0);
            HEAP32[$fd408$i>>2] = $add$ptr$i174;
            break L128;
           }
          } while(0);
          $fd416$i = ((($T$0$lcssa$i)) + 8|0);
          $66 = HEAP32[$fd416$i>>2]|0;
          $bk429$i = ((($66)) + 12|0);
          HEAP32[$bk429$i>>2] = $add$ptr$i174;
          HEAP32[$fd416$i>>2] = $add$ptr$i174;
          $fd431$i = ((($add$ptr$i174)) + 8|0);
          HEAP32[$fd431$i>>2] = $66;
          $bk432$i = ((($add$ptr$i174)) + 12|0);
          HEAP32[$bk432$i>>2] = $T$0$lcssa$i;
          $parent433$i = ((($add$ptr$i174)) + 24|0);
          HEAP32[$parent433$i>>2] = 0;
         }
        } while(0);
        $add$ptr441$i = ((($v$4$lcssa$i)) + 8|0);
        $retval$0 = $add$ptr441$i;
        STACKTOP = sp;return ($retval$0|0);
       } else {
        $nb$0 = $and145;
       }
      } else {
       $nb$0 = $and145;
      }
     }
    }
   }
  }
 } while(0);
 $67 = HEAP32[(2780)>>2]|0;
 $cmp156 = ($67>>>0)<($nb$0>>>0);
 if (!($cmp156)) {
  $sub160 = (($67) - ($nb$0))|0;
  $68 = HEAP32[(2792)>>2]|0;
  $cmp162 = ($sub160>>>0)>(15);
  if ($cmp162) {
   $add$ptr166 = (($68) + ($nb$0)|0);
   HEAP32[(2792)>>2] = $add$ptr166;
   HEAP32[(2780)>>2] = $sub160;
   $or167 = $sub160 | 1;
   $head168 = ((($add$ptr166)) + 4|0);
   HEAP32[$head168>>2] = $or167;
   $add$ptr169 = (($68) + ($67)|0);
   HEAP32[$add$ptr169>>2] = $sub160;
   $or172 = $nb$0 | 3;
   $head173 = ((($68)) + 4|0);
   HEAP32[$head173>>2] = $or172;
  } else {
   HEAP32[(2780)>>2] = 0;
   HEAP32[(2792)>>2] = 0;
   $or176 = $67 | 3;
   $head177 = ((($68)) + 4|0);
   HEAP32[$head177>>2] = $or176;
   $add$ptr178 = (($68) + ($67)|0);
   $head179 = ((($add$ptr178)) + 4|0);
   $69 = HEAP32[$head179>>2]|0;
   $or180 = $69 | 1;
   HEAP32[$head179>>2] = $or180;
  }
  $add$ptr182 = ((($68)) + 8|0);
  $retval$0 = $add$ptr182;
  STACKTOP = sp;return ($retval$0|0);
 }
 $70 = HEAP32[(2784)>>2]|0;
 $cmp186 = ($70>>>0)>($nb$0>>>0);
 if ($cmp186) {
  $sub190 = (($70) - ($nb$0))|0;
  HEAP32[(2784)>>2] = $sub190;
  $71 = HEAP32[(2796)>>2]|0;
  $add$ptr193 = (($71) + ($nb$0)|0);
  HEAP32[(2796)>>2] = $add$ptr193;
  $or194 = $sub190 | 1;
  $head195 = ((($add$ptr193)) + 4|0);
  HEAP32[$head195>>2] = $or194;
  $or197 = $nb$0 | 3;
  $head198 = ((($71)) + 4|0);
  HEAP32[$head198>>2] = $or197;
  $add$ptr199 = ((($71)) + 8|0);
  $retval$0 = $add$ptr199;
  STACKTOP = sp;return ($retval$0|0);
 }
 $72 = HEAP32[811]|0;
 $cmp$i133 = ($72|0)==(0);
 if ($cmp$i133) {
  HEAP32[(3252)>>2] = 4096;
  HEAP32[(3248)>>2] = 4096;
  HEAP32[(3256)>>2] = -1;
  HEAP32[(3260)>>2] = -1;
  HEAP32[(3264)>>2] = 0;
  HEAP32[(3216)>>2] = 0;
  $73 = $magic$i$i;
  $xor$i$i = $73 & -16;
  $and6$i$i = $xor$i$i ^ 1431655768;
  HEAP32[811] = $and6$i$i;
  $74 = 4096;
 } else {
  $$pre$i134 = HEAP32[(3252)>>2]|0;
  $74 = $$pre$i134;
 }
 $add$i135 = (($nb$0) + 48)|0;
 $sub$i136 = (($nb$0) + 47)|0;
 $add9$i = (($74) + ($sub$i136))|0;
 $neg$i137 = (0 - ($74))|0;
 $and11$i = $add9$i & $neg$i137;
 $cmp12$i = ($and11$i>>>0)>($nb$0>>>0);
 if (!($cmp12$i)) {
  $retval$0 = 0;
  STACKTOP = sp;return ($retval$0|0);
 }
 $75 = HEAP32[(3212)>>2]|0;
 $cmp15$i = ($75|0)==(0);
 if (!($cmp15$i)) {
  $76 = HEAP32[(3204)>>2]|0;
  $add17$i = (($76) + ($and11$i))|0;
  $cmp19$i = ($add17$i>>>0)<=($76>>>0);
  $cmp21$i = ($add17$i>>>0)>($75>>>0);
  $or$cond1$i = $cmp19$i | $cmp21$i;
  if ($or$cond1$i) {
   $retval$0 = 0;
   STACKTOP = sp;return ($retval$0|0);
  }
 }
 $77 = HEAP32[(3216)>>2]|0;
 $and29$i = $77 & 4;
 $tobool30$i = ($and29$i|0)==(0);
 L178: do {
  if ($tobool30$i) {
   $78 = HEAP32[(2796)>>2]|0;
   $cmp32$i138 = ($78|0)==(0|0);
   L180: do {
    if ($cmp32$i138) {
     label = 128;
    } else {
     $sp$0$i$i = (3220);
     while(1) {
      $79 = HEAP32[$sp$0$i$i>>2]|0;
      $cmp$i55$i = ($79>>>0)>($78>>>0);
      if (!($cmp$i55$i)) {
       $size$i$i = ((($sp$0$i$i)) + 4|0);
       $80 = HEAP32[$size$i$i>>2]|0;
       $add$ptr$i57$i = (($79) + ($80)|0);
       $cmp2$i$i = ($add$ptr$i57$i>>>0)>($78>>>0);
       if ($cmp2$i$i) {
        break;
       }
      }
      $next$i$i = ((($sp$0$i$i)) + 8|0);
      $81 = HEAP32[$next$i$i>>2]|0;
      $cmp3$i$i = ($81|0)==(0|0);
      if ($cmp3$i$i) {
       label = 128;
       break L180;
      } else {
       $sp$0$i$i = $81;
      }
     }
     $add77$i = (($add9$i) - ($70))|0;
     $and80$i = $add77$i & $neg$i137;
     $cmp81$i = ($and80$i>>>0)<(2147483647);
     if ($cmp81$i) {
      $size$i$i$le = ((($sp$0$i$i)) + 4|0);
      $call83$i = (_sbrk($and80$i)|0);
      $86 = HEAP32[$sp$0$i$i>>2]|0;
      $87 = HEAP32[$size$i$i$le>>2]|0;
      $add$ptr$i141 = (($86) + ($87)|0);
      $cmp85$i = ($call83$i|0)==($add$ptr$i141|0);
      if ($cmp85$i) {
       $cmp89$i = ($call83$i|0)==((-1)|0);
       if ($cmp89$i) {
        $tsize$2647482$i = $and80$i;
       } else {
        $tbase$795$i = $call83$i;$tsize$794$i = $and80$i;
        label = 145;
        break L178;
       }
      } else {
       $br$2$ph$i = $call83$i;$ssize$2$ph$i = $and80$i;
       label = 136;
      }
     } else {
      $tsize$2647482$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 128) {
     $call37$i = (_sbrk(0)|0);
     $cmp38$i = ($call37$i|0)==((-1)|0);
     if ($cmp38$i) {
      $tsize$2647482$i = 0;
     } else {
      $82 = $call37$i;
      $83 = HEAP32[(3248)>>2]|0;
      $sub41$i = (($83) + -1)|0;
      $and42$i = $sub41$i & $82;
      $cmp43$i = ($and42$i|0)==(0);
      $add46$i = (($sub41$i) + ($82))|0;
      $neg48$i = (0 - ($83))|0;
      $and49$i = $add46$i & $neg48$i;
      $sub50$i = (($and49$i) - ($82))|0;
      $add51$i = $cmp43$i ? 0 : $sub50$i;
      $spec$select96$i = (($add51$i) + ($and11$i))|0;
      $84 = HEAP32[(3204)>>2]|0;
      $add54$i = (($spec$select96$i) + ($84))|0;
      $cmp55$i = ($spec$select96$i>>>0)>($nb$0>>>0);
      $cmp57$i = ($spec$select96$i>>>0)<(2147483647);
      $or$cond$i = $cmp55$i & $cmp57$i;
      if ($or$cond$i) {
       $85 = HEAP32[(3212)>>2]|0;
       $cmp60$i = ($85|0)==(0);
       if (!($cmp60$i)) {
        $cmp63$i = ($add54$i>>>0)<=($84>>>0);
        $cmp66$i140 = ($add54$i>>>0)>($85>>>0);
        $or$cond2$i = $cmp63$i | $cmp66$i140;
        if ($or$cond2$i) {
         $tsize$2647482$i = 0;
         break;
        }
       }
       $call68$i = (_sbrk($spec$select96$i)|0);
       $cmp69$i = ($call68$i|0)==($call37$i|0);
       if ($cmp69$i) {
        $tbase$795$i = $call37$i;$tsize$794$i = $spec$select96$i;
        label = 145;
        break L178;
       } else {
        $br$2$ph$i = $call68$i;$ssize$2$ph$i = $spec$select96$i;
        label = 136;
       }
      } else {
       $tsize$2647482$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 136) {
     $sub112$i = (0 - ($ssize$2$ph$i))|0;
     $cmp91$i = ($br$2$ph$i|0)!=((-1)|0);
     $cmp93$i = ($ssize$2$ph$i>>>0)<(2147483647);
     $or$cond5$i = $cmp93$i & $cmp91$i;
     $cmp96$i = ($add$i135>>>0)>($ssize$2$ph$i>>>0);
     $or$cond7$i = $cmp96$i & $or$cond5$i;
     if (!($or$cond7$i)) {
      $cmp118$i = ($br$2$ph$i|0)==((-1)|0);
      if ($cmp118$i) {
       $tsize$2647482$i = 0;
       break;
      } else {
       $tbase$795$i = $br$2$ph$i;$tsize$794$i = $ssize$2$ph$i;
       label = 145;
       break L178;
      }
     }
     $88 = HEAP32[(3252)>>2]|0;
     $sub99$i = (($sub$i136) - ($ssize$2$ph$i))|0;
     $add101$i = (($sub99$i) + ($88))|0;
     $neg103$i = (0 - ($88))|0;
     $and104$i = $add101$i & $neg103$i;
     $cmp105$i = ($and104$i>>>0)<(2147483647);
     if (!($cmp105$i)) {
      $tbase$795$i = $br$2$ph$i;$tsize$794$i = $ssize$2$ph$i;
      label = 145;
      break L178;
     }
     $call107$i = (_sbrk($and104$i)|0);
     $cmp108$i = ($call107$i|0)==((-1)|0);
     if ($cmp108$i) {
      (_sbrk($sub112$i)|0);
      $tsize$2647482$i = 0;
      break;
     } else {
      $add110$i = (($and104$i) + ($ssize$2$ph$i))|0;
      $tbase$795$i = $br$2$ph$i;$tsize$794$i = $add110$i;
      label = 145;
      break L178;
     }
    }
   } while(0);
   $89 = HEAP32[(3216)>>2]|0;
   $or$i = $89 | 4;
   HEAP32[(3216)>>2] = $or$i;
   $tsize$4$i = $tsize$2647482$i;
   label = 143;
  } else {
   $tsize$4$i = 0;
   label = 143;
  }
 } while(0);
 if ((label|0) == 143) {
  $cmp127$i = ($and11$i>>>0)<(2147483647);
  if ($cmp127$i) {
   $call131$i = (_sbrk($and11$i)|0);
   $call132$i = (_sbrk(0)|0);
   $cmp133$i = ($call131$i|0)!=((-1)|0);
   $cmp135$i = ($call132$i|0)!=((-1)|0);
   $or$cond4$i = $cmp133$i & $cmp135$i;
   $cmp137$i = ($call131$i>>>0)<($call132$i>>>0);
   $or$cond8$i = $cmp137$i & $or$cond4$i;
   $sub$ptr$lhs$cast$i = $call132$i;
   $sub$ptr$rhs$cast$i = $call131$i;
   $sub$ptr$sub$i = (($sub$ptr$lhs$cast$i) - ($sub$ptr$rhs$cast$i))|0;
   $add140$i = (($nb$0) + 40)|0;
   $cmp141$i = ($sub$ptr$sub$i>>>0)>($add140$i>>>0);
   $spec$select9$i = $cmp141$i ? $sub$ptr$sub$i : $tsize$4$i;
   $or$cond8$not$i = $or$cond8$i ^ 1;
   $cmp14799$i = ($call131$i|0)==((-1)|0);
   $not$cmp141$i = $cmp141$i ^ 1;
   $cmp147$i = $cmp14799$i | $not$cmp141$i;
   $or$cond97$i = $cmp147$i | $or$cond8$not$i;
   if (!($or$cond97$i)) {
    $tbase$795$i = $call131$i;$tsize$794$i = $spec$select9$i;
    label = 145;
   }
  }
 }
 if ((label|0) == 145) {
  $90 = HEAP32[(3204)>>2]|0;
  $add150$i = (($90) + ($tsize$794$i))|0;
  HEAP32[(3204)>>2] = $add150$i;
  $91 = HEAP32[(3208)>>2]|0;
  $cmp151$i = ($add150$i>>>0)>($91>>>0);
  if ($cmp151$i) {
   HEAP32[(3208)>>2] = $add150$i;
  }
  $92 = HEAP32[(2796)>>2]|0;
  $cmp157$i = ($92|0)==(0|0);
  L215: do {
   if ($cmp157$i) {
    $93 = HEAP32[(2788)>>2]|0;
    $cmp159$i = ($93|0)==(0|0);
    $cmp162$i = ($tbase$795$i>>>0)<($93>>>0);
    $or$cond11$i = $cmp159$i | $cmp162$i;
    if ($or$cond11$i) {
     HEAP32[(2788)>>2] = $tbase$795$i;
    }
    HEAP32[(3220)>>2] = $tbase$795$i;
    HEAP32[(3224)>>2] = $tsize$794$i;
    HEAP32[(3232)>>2] = 0;
    $94 = HEAP32[811]|0;
    HEAP32[(2808)>>2] = $94;
    HEAP32[(2804)>>2] = -1;
    HEAP32[(2824)>>2] = (2812);
    HEAP32[(2820)>>2] = (2812);
    HEAP32[(2832)>>2] = (2820);
    HEAP32[(2828)>>2] = (2820);
    HEAP32[(2840)>>2] = (2828);
    HEAP32[(2836)>>2] = (2828);
    HEAP32[(2848)>>2] = (2836);
    HEAP32[(2844)>>2] = (2836);
    HEAP32[(2856)>>2] = (2844);
    HEAP32[(2852)>>2] = (2844);
    HEAP32[(2864)>>2] = (2852);
    HEAP32[(2860)>>2] = (2852);
    HEAP32[(2872)>>2] = (2860);
    HEAP32[(2868)>>2] = (2860);
    HEAP32[(2880)>>2] = (2868);
    HEAP32[(2876)>>2] = (2868);
    HEAP32[(2888)>>2] = (2876);
    HEAP32[(2884)>>2] = (2876);
    HEAP32[(2896)>>2] = (2884);
    HEAP32[(2892)>>2] = (2884);
    HEAP32[(2904)>>2] = (2892);
    HEAP32[(2900)>>2] = (2892);
    HEAP32[(2912)>>2] = (2900);
    HEAP32[(2908)>>2] = (2900);
    HEAP32[(2920)>>2] = (2908);
    HEAP32[(2916)>>2] = (2908);
    HEAP32[(2928)>>2] = (2916);
    HEAP32[(2924)>>2] = (2916);
    HEAP32[(2936)>>2] = (2924);
    HEAP32[(2932)>>2] = (2924);
    HEAP32[(2944)>>2] = (2932);
    HEAP32[(2940)>>2] = (2932);
    HEAP32[(2952)>>2] = (2940);
    HEAP32[(2948)>>2] = (2940);
    HEAP32[(2960)>>2] = (2948);
    HEAP32[(2956)>>2] = (2948);
    HEAP32[(2968)>>2] = (2956);
    HEAP32[(2964)>>2] = (2956);
    HEAP32[(2976)>>2] = (2964);
    HEAP32[(2972)>>2] = (2964);
    HEAP32[(2984)>>2] = (2972);
    HEAP32[(2980)>>2] = (2972);
    HEAP32[(2992)>>2] = (2980);
    HEAP32[(2988)>>2] = (2980);
    HEAP32[(3000)>>2] = (2988);
    HEAP32[(2996)>>2] = (2988);
    HEAP32[(3008)>>2] = (2996);
    HEAP32[(3004)>>2] = (2996);
    HEAP32[(3016)>>2] = (3004);
    HEAP32[(3012)>>2] = (3004);
    HEAP32[(3024)>>2] = (3012);
    HEAP32[(3020)>>2] = (3012);
    HEAP32[(3032)>>2] = (3020);
    HEAP32[(3028)>>2] = (3020);
    HEAP32[(3040)>>2] = (3028);
    HEAP32[(3036)>>2] = (3028);
    HEAP32[(3048)>>2] = (3036);
    HEAP32[(3044)>>2] = (3036);
    HEAP32[(3056)>>2] = (3044);
    HEAP32[(3052)>>2] = (3044);
    HEAP32[(3064)>>2] = (3052);
    HEAP32[(3060)>>2] = (3052);
    HEAP32[(3072)>>2] = (3060);
    HEAP32[(3068)>>2] = (3060);
    $sub172$i = (($tsize$794$i) + -40)|0;
    $add$ptr$i43$i = ((($tbase$795$i)) + 8|0);
    $95 = $add$ptr$i43$i;
    $and$i44$i = $95 & 7;
    $cmp$i45$i = ($and$i44$i|0)==(0);
    $sub$i46$i = (0 - ($95))|0;
    $and3$i47$i = $sub$i46$i & 7;
    $cond$i48$i = $cmp$i45$i ? 0 : $and3$i47$i;
    $add$ptr4$i49$i = (($tbase$795$i) + ($cond$i48$i)|0);
    $sub5$i50$i = (($sub172$i) - ($cond$i48$i))|0;
    HEAP32[(2796)>>2] = $add$ptr4$i49$i;
    HEAP32[(2784)>>2] = $sub5$i50$i;
    $or$i51$i = $sub5$i50$i | 1;
    $head$i52$i = ((($add$ptr4$i49$i)) + 4|0);
    HEAP32[$head$i52$i>>2] = $or$i51$i;
    $add$ptr6$i53$i = (($tbase$795$i) + ($sub172$i)|0);
    $head7$i54$i = ((($add$ptr6$i53$i)) + 4|0);
    HEAP32[$head7$i54$i>>2] = 40;
    $96 = HEAP32[(3260)>>2]|0;
    HEAP32[(2800)>>2] = $96;
   } else {
    $sp$0112$i = (3220);
    while(1) {
     $97 = HEAP32[$sp$0112$i>>2]|0;
     $size188$i = ((($sp$0112$i)) + 4|0);
     $98 = HEAP32[$size188$i>>2]|0;
     $add$ptr189$i = (($97) + ($98)|0);
     $cmp190$i = ($tbase$795$i|0)==($add$ptr189$i|0);
     if ($cmp190$i) {
      label = 154;
      break;
     }
     $next$i = ((($sp$0112$i)) + 8|0);
     $99 = HEAP32[$next$i>>2]|0;
     $cmp186$i = ($99|0)==(0|0);
     if ($cmp186$i) {
      break;
     } else {
      $sp$0112$i = $99;
     }
    }
    if ((label|0) == 154) {
     $size188$i$le = ((($sp$0112$i)) + 4|0);
     $sflags193$i = ((($sp$0112$i)) + 12|0);
     $100 = HEAP32[$sflags193$i>>2]|0;
     $and194$i = $100 & 8;
     $tobool195$i = ($and194$i|0)==(0);
     if ($tobool195$i) {
      $cmp203$i = ($97>>>0)<=($92>>>0);
      $cmp209$i = ($tbase$795$i>>>0)>($92>>>0);
      $or$cond98$i = $cmp209$i & $cmp203$i;
      if ($or$cond98$i) {
       $add212$i = (($98) + ($tsize$794$i))|0;
       HEAP32[$size188$i$le>>2] = $add212$i;
       $101 = HEAP32[(2784)>>2]|0;
       $add215$i = (($101) + ($tsize$794$i))|0;
       $add$ptr$i35$i = ((($92)) + 8|0);
       $102 = $add$ptr$i35$i;
       $and$i36$i = $102 & 7;
       $cmp$i37$i = ($and$i36$i|0)==(0);
       $sub$i38$i = (0 - ($102))|0;
       $and3$i39$i = $sub$i38$i & 7;
       $cond$i40$i = $cmp$i37$i ? 0 : $and3$i39$i;
       $add$ptr4$i41$i = (($92) + ($cond$i40$i)|0);
       $sub5$i$i = (($add215$i) - ($cond$i40$i))|0;
       HEAP32[(2796)>>2] = $add$ptr4$i41$i;
       HEAP32[(2784)>>2] = $sub5$i$i;
       $or$i$i = $sub5$i$i | 1;
       $head$i42$i = ((($add$ptr4$i41$i)) + 4|0);
       HEAP32[$head$i42$i>>2] = $or$i$i;
       $add$ptr6$i$i = (($92) + ($add215$i)|0);
       $head7$i$i = ((($add$ptr6$i$i)) + 4|0);
       HEAP32[$head7$i$i>>2] = 40;
       $103 = HEAP32[(3260)>>2]|0;
       HEAP32[(2800)>>2] = $103;
       break;
      }
     }
    }
    $104 = HEAP32[(2788)>>2]|0;
    $cmp218$i = ($tbase$795$i>>>0)<($104>>>0);
    if ($cmp218$i) {
     HEAP32[(2788)>>2] = $tbase$795$i;
    }
    $add$ptr227$i = (($tbase$795$i) + ($tsize$794$i)|0);
    $sp$1111$i = (3220);
    while(1) {
     $105 = HEAP32[$sp$1111$i>>2]|0;
     $cmp228$i = ($105|0)==($add$ptr227$i|0);
     if ($cmp228$i) {
      label = 162;
      break;
     }
     $next231$i = ((($sp$1111$i)) + 8|0);
     $106 = HEAP32[$next231$i>>2]|0;
     $cmp224$i = ($106|0)==(0|0);
     if ($cmp224$i) {
      break;
     } else {
      $sp$1111$i = $106;
     }
    }
    if ((label|0) == 162) {
     $sflags235$i = ((($sp$1111$i)) + 12|0);
     $107 = HEAP32[$sflags235$i>>2]|0;
     $and236$i = $107 & 8;
     $tobool237$i = ($and236$i|0)==(0);
     if ($tobool237$i) {
      HEAP32[$sp$1111$i>>2] = $tbase$795$i;
      $size245$i = ((($sp$1111$i)) + 4|0);
      $108 = HEAP32[$size245$i>>2]|0;
      $add246$i = (($108) + ($tsize$794$i))|0;
      HEAP32[$size245$i>>2] = $add246$i;
      $add$ptr$i$i = ((($tbase$795$i)) + 8|0);
      $109 = $add$ptr$i$i;
      $and$i14$i = $109 & 7;
      $cmp$i15$i = ($and$i14$i|0)==(0);
      $sub$i16$i = (0 - ($109))|0;
      $and3$i$i = $sub$i16$i & 7;
      $cond$i17$i = $cmp$i15$i ? 0 : $and3$i$i;
      $add$ptr4$i$i = (($tbase$795$i) + ($cond$i17$i)|0);
      $add$ptr5$i$i = ((($add$ptr227$i)) + 8|0);
      $110 = $add$ptr5$i$i;
      $and6$i18$i = $110 & 7;
      $cmp7$i$i = ($and6$i18$i|0)==(0);
      $sub12$i$i = (0 - ($110))|0;
      $and13$i$i = $sub12$i$i & 7;
      $cond15$i$i = $cmp7$i$i ? 0 : $and13$i$i;
      $add$ptr16$i$i = (($add$ptr227$i) + ($cond15$i$i)|0);
      $sub$ptr$lhs$cast$i19$i = $add$ptr16$i$i;
      $sub$ptr$rhs$cast$i20$i = $add$ptr4$i$i;
      $sub$ptr$sub$i21$i = (($sub$ptr$lhs$cast$i19$i) - ($sub$ptr$rhs$cast$i20$i))|0;
      $add$ptr17$i$i = (($add$ptr4$i$i) + ($nb$0)|0);
      $sub18$i$i = (($sub$ptr$sub$i21$i) - ($nb$0))|0;
      $or19$i$i = $nb$0 | 3;
      $head$i22$i = ((($add$ptr4$i$i)) + 4|0);
      HEAP32[$head$i22$i>>2] = $or19$i$i;
      $cmp20$i$i = ($92|0)==($add$ptr16$i$i|0);
      L238: do {
       if ($cmp20$i$i) {
        $111 = HEAP32[(2784)>>2]|0;
        $add$i$i = (($111) + ($sub18$i$i))|0;
        HEAP32[(2784)>>2] = $add$i$i;
        HEAP32[(2796)>>2] = $add$ptr17$i$i;
        $or22$i$i = $add$i$i | 1;
        $head23$i$i = ((($add$ptr17$i$i)) + 4|0);
        HEAP32[$head23$i$i>>2] = $or22$i$i;
       } else {
        $112 = HEAP32[(2792)>>2]|0;
        $cmp24$i$i = ($112|0)==($add$ptr16$i$i|0);
        if ($cmp24$i$i) {
         $113 = HEAP32[(2780)>>2]|0;
         $add26$i$i = (($113) + ($sub18$i$i))|0;
         HEAP32[(2780)>>2] = $add26$i$i;
         HEAP32[(2792)>>2] = $add$ptr17$i$i;
         $or28$i$i = $add26$i$i | 1;
         $head29$i$i = ((($add$ptr17$i$i)) + 4|0);
         HEAP32[$head29$i$i>>2] = $or28$i$i;
         $add$ptr30$i$i = (($add$ptr17$i$i) + ($add26$i$i)|0);
         HEAP32[$add$ptr30$i$i>>2] = $add26$i$i;
         break;
        }
        $head32$i$i = ((($add$ptr16$i$i)) + 4|0);
        $114 = HEAP32[$head32$i$i>>2]|0;
        $and33$i$i = $114 & 3;
        $cmp34$i$i = ($and33$i$i|0)==(1);
        if ($cmp34$i$i) {
         $and37$i$i = $114 & -8;
         $shr$i25$i = $114 >>> 3;
         $cmp38$i$i = ($114>>>0)<(256);
         L246: do {
          if ($cmp38$i$i) {
           $fd$i$i = ((($add$ptr16$i$i)) + 8|0);
           $115 = HEAP32[$fd$i$i>>2]|0;
           $bk$i26$i = ((($add$ptr16$i$i)) + 12|0);
           $116 = HEAP32[$bk$i26$i>>2]|0;
           $cmp46$i$i = ($116|0)==($115|0);
           if ($cmp46$i$i) {
            $shl48$i$i = 1 << $shr$i25$i;
            $neg$i$i = $shl48$i$i ^ -1;
            $117 = HEAP32[693]|0;
            $and49$i$i = $117 & $neg$i$i;
            HEAP32[693] = $and49$i$i;
            break;
           } else {
            $bk67$i$i = ((($115)) + 12|0);
            HEAP32[$bk67$i$i>>2] = $116;
            $fd68$i$i = ((($116)) + 8|0);
            HEAP32[$fd68$i$i>>2] = $115;
            break;
           }
          } else {
           $parent$i27$i = ((($add$ptr16$i$i)) + 24|0);
           $118 = HEAP32[$parent$i27$i>>2]|0;
           $bk74$i$i = ((($add$ptr16$i$i)) + 12|0);
           $119 = HEAP32[$bk74$i$i>>2]|0;
           $cmp75$i$i = ($119|0)==($add$ptr16$i$i|0);
           do {
            if ($cmp75$i$i) {
             $child$i$i = ((($add$ptr16$i$i)) + 16|0);
             $arrayidx96$i$i = ((($child$i$i)) + 4|0);
             $121 = HEAP32[$arrayidx96$i$i>>2]|0;
             $cmp97$i$i = ($121|0)==(0|0);
             if ($cmp97$i$i) {
              $122 = HEAP32[$child$i$i>>2]|0;
              $cmp100$i$i = ($122|0)==(0|0);
              if ($cmp100$i$i) {
               $R$3$i$i = 0;
               break;
              } else {
               $R$1$i$i$ph = $122;$RP$1$i$i$ph = $child$i$i;
              }
             } else {
              $R$1$i$i$ph = $121;$RP$1$i$i$ph = $arrayidx96$i$i;
             }
             $R$1$i$i = $R$1$i$i$ph;$RP$1$i$i = $RP$1$i$i$ph;
             while(1) {
              $arrayidx103$i$i = ((($R$1$i$i)) + 20|0);
              $123 = HEAP32[$arrayidx103$i$i>>2]|0;
              $cmp104$i$i = ($123|0)==(0|0);
              if ($cmp104$i$i) {
               $arrayidx107$i$i = ((($R$1$i$i)) + 16|0);
               $124 = HEAP32[$arrayidx107$i$i>>2]|0;
               $cmp108$i$i = ($124|0)==(0|0);
               if ($cmp108$i$i) {
                break;
               } else {
                $R$1$i$i$be = $124;$RP$1$i$i$be = $arrayidx107$i$i;
               }
              } else {
               $R$1$i$i$be = $123;$RP$1$i$i$be = $arrayidx103$i$i;
              }
              $R$1$i$i = $R$1$i$i$be;$RP$1$i$i = $RP$1$i$i$be;
             }
             HEAP32[$RP$1$i$i>>2] = 0;
             $R$3$i$i = $R$1$i$i;
            } else {
             $fd78$i$i = ((($add$ptr16$i$i)) + 8|0);
             $120 = HEAP32[$fd78$i$i>>2]|0;
             $bk91$i$i = ((($120)) + 12|0);
             HEAP32[$bk91$i$i>>2] = $119;
             $fd92$i$i = ((($119)) + 8|0);
             HEAP32[$fd92$i$i>>2] = $120;
             $R$3$i$i = $119;
            }
           } while(0);
           $cmp120$i28$i = ($118|0)==(0|0);
           if ($cmp120$i28$i) {
            break;
           }
           $index$i29$i = ((($add$ptr16$i$i)) + 28|0);
           $125 = HEAP32[$index$i29$i>>2]|0;
           $arrayidx123$i$i = (3076 + ($125<<2)|0);
           $126 = HEAP32[$arrayidx123$i$i>>2]|0;
           $cmp124$i$i = ($126|0)==($add$ptr16$i$i|0);
           do {
            if ($cmp124$i$i) {
             HEAP32[$arrayidx123$i$i>>2] = $R$3$i$i;
             $cond1$i$i = ($R$3$i$i|0)==(0|0);
             if (!($cond1$i$i)) {
              break;
             }
             $shl131$i$i = 1 << $125;
             $neg132$i$i = $shl131$i$i ^ -1;
             $127 = HEAP32[(2776)>>2]|0;
             $and133$i$i = $127 & $neg132$i$i;
             HEAP32[(2776)>>2] = $and133$i$i;
             break L246;
            } else {
             $arrayidx143$i$i = ((($118)) + 16|0);
             $128 = HEAP32[$arrayidx143$i$i>>2]|0;
             $cmp144$i$i = ($128|0)==($add$ptr16$i$i|0);
             $arrayidx151$i$i = ((($118)) + 20|0);
             $arrayidx151$i$i$sink = $cmp144$i$i ? $arrayidx143$i$i : $arrayidx151$i$i;
             HEAP32[$arrayidx151$i$i$sink>>2] = $R$3$i$i;
             $cmp156$i$i = ($R$3$i$i|0)==(0|0);
             if ($cmp156$i$i) {
              break L246;
             }
            }
           } while(0);
           $parent165$i$i = ((($R$3$i$i)) + 24|0);
           HEAP32[$parent165$i$i>>2] = $118;
           $child166$i$i = ((($add$ptr16$i$i)) + 16|0);
           $129 = HEAP32[$child166$i$i>>2]|0;
           $cmp168$i$i = ($129|0)==(0|0);
           if (!($cmp168$i$i)) {
            $arrayidx178$i$i = ((($R$3$i$i)) + 16|0);
            HEAP32[$arrayidx178$i$i>>2] = $129;
            $parent179$i$i = ((($129)) + 24|0);
            HEAP32[$parent179$i$i>>2] = $R$3$i$i;
           }
           $arrayidx184$i$i = ((($child166$i$i)) + 4|0);
           $130 = HEAP32[$arrayidx184$i$i>>2]|0;
           $cmp185$i$i = ($130|0)==(0|0);
           if ($cmp185$i$i) {
            break;
           }
           $arrayidx195$i$i = ((($R$3$i$i)) + 20|0);
           HEAP32[$arrayidx195$i$i>>2] = $130;
           $parent196$i$i = ((($130)) + 24|0);
           HEAP32[$parent196$i$i>>2] = $R$3$i$i;
          }
         } while(0);
         $add$ptr205$i$i = (($add$ptr16$i$i) + ($and37$i$i)|0);
         $add206$i$i = (($and37$i$i) + ($sub18$i$i))|0;
         $oldfirst$0$i$i = $add$ptr205$i$i;$qsize$0$i$i = $add206$i$i;
        } else {
         $oldfirst$0$i$i = $add$ptr16$i$i;$qsize$0$i$i = $sub18$i$i;
        }
        $head208$i$i = ((($oldfirst$0$i$i)) + 4|0);
        $131 = HEAP32[$head208$i$i>>2]|0;
        $and209$i$i = $131 & -2;
        HEAP32[$head208$i$i>>2] = $and209$i$i;
        $or210$i$i = $qsize$0$i$i | 1;
        $head211$i$i = ((($add$ptr17$i$i)) + 4|0);
        HEAP32[$head211$i$i>>2] = $or210$i$i;
        $add$ptr212$i$i = (($add$ptr17$i$i) + ($qsize$0$i$i)|0);
        HEAP32[$add$ptr212$i$i>>2] = $qsize$0$i$i;
        $shr214$i$i = $qsize$0$i$i >>> 3;
        $cmp215$i$i = ($qsize$0$i$i>>>0)<(256);
        if ($cmp215$i$i) {
         $shl222$i$i = $shr214$i$i << 1;
         $arrayidx223$i$i = (2812 + ($shl222$i$i<<2)|0);
         $132 = HEAP32[693]|0;
         $shl226$i$i = 1 << $shr214$i$i;
         $and227$i$i = $132 & $shl226$i$i;
         $tobool228$i$i = ($and227$i$i|0)==(0);
         if ($tobool228$i$i) {
          $or232$i$i = $132 | $shl226$i$i;
          HEAP32[693] = $or232$i$i;
          $$pre$i31$i = ((($arrayidx223$i$i)) + 8|0);
          $$pre$phi$i32$iZ2D = $$pre$i31$i;$F224$0$i$i = $arrayidx223$i$i;
         } else {
          $133 = ((($arrayidx223$i$i)) + 8|0);
          $134 = HEAP32[$133>>2]|0;
          $$pre$phi$i32$iZ2D = $133;$F224$0$i$i = $134;
         }
         HEAP32[$$pre$phi$i32$iZ2D>>2] = $add$ptr17$i$i;
         $bk246$i$i = ((($F224$0$i$i)) + 12|0);
         HEAP32[$bk246$i$i>>2] = $add$ptr17$i$i;
         $fd247$i$i = ((($add$ptr17$i$i)) + 8|0);
         HEAP32[$fd247$i$i>>2] = $F224$0$i$i;
         $bk248$i$i = ((($add$ptr17$i$i)) + 12|0);
         HEAP32[$bk248$i$i>>2] = $arrayidx223$i$i;
         break;
        }
        $shr253$i$i = $qsize$0$i$i >>> 8;
        $cmp254$i$i = ($shr253$i$i|0)==(0);
        do {
         if ($cmp254$i$i) {
          $I252$0$i$i = 0;
         } else {
          $cmp258$i$i = ($qsize$0$i$i>>>0)>(16777215);
          if ($cmp258$i$i) {
           $I252$0$i$i = 31;
           break;
          }
          $sub262$i$i = (($shr253$i$i) + 1048320)|0;
          $shr263$i$i = $sub262$i$i >>> 16;
          $and264$i$i = $shr263$i$i & 8;
          $shl265$i$i = $shr253$i$i << $and264$i$i;
          $sub266$i$i = (($shl265$i$i) + 520192)|0;
          $shr267$i$i = $sub266$i$i >>> 16;
          $and268$i$i = $shr267$i$i & 4;
          $add269$i$i = $and268$i$i | $and264$i$i;
          $shl270$i$i = $shl265$i$i << $and268$i$i;
          $sub271$i$i = (($shl270$i$i) + 245760)|0;
          $shr272$i$i = $sub271$i$i >>> 16;
          $and273$i$i = $shr272$i$i & 2;
          $add274$i$i = $add269$i$i | $and273$i$i;
          $sub275$i$i = (14 - ($add274$i$i))|0;
          $shl276$i$i = $shl270$i$i << $and273$i$i;
          $shr277$i$i = $shl276$i$i >>> 15;
          $add278$i$i = (($sub275$i$i) + ($shr277$i$i))|0;
          $shl279$i$i = $add278$i$i << 1;
          $add280$i$i = (($add278$i$i) + 7)|0;
          $shr281$i$i = $qsize$0$i$i >>> $add280$i$i;
          $and282$i$i = $shr281$i$i & 1;
          $add283$i$i = $and282$i$i | $shl279$i$i;
          $I252$0$i$i = $add283$i$i;
         }
        } while(0);
        $arrayidx287$i$i = (3076 + ($I252$0$i$i<<2)|0);
        $index288$i$i = ((($add$ptr17$i$i)) + 28|0);
        HEAP32[$index288$i$i>>2] = $I252$0$i$i;
        $child289$i$i = ((($add$ptr17$i$i)) + 16|0);
        $arrayidx290$i$i = ((($child289$i$i)) + 4|0);
        HEAP32[$arrayidx290$i$i>>2] = 0;
        HEAP32[$child289$i$i>>2] = 0;
        $135 = HEAP32[(2776)>>2]|0;
        $shl294$i$i = 1 << $I252$0$i$i;
        $and295$i$i = $135 & $shl294$i$i;
        $tobool296$i$i = ($and295$i$i|0)==(0);
        if ($tobool296$i$i) {
         $or300$i$i = $135 | $shl294$i$i;
         HEAP32[(2776)>>2] = $or300$i$i;
         HEAP32[$arrayidx287$i$i>>2] = $add$ptr17$i$i;
         $parent301$i$i = ((($add$ptr17$i$i)) + 24|0);
         HEAP32[$parent301$i$i>>2] = $arrayidx287$i$i;
         $bk302$i$i = ((($add$ptr17$i$i)) + 12|0);
         HEAP32[$bk302$i$i>>2] = $add$ptr17$i$i;
         $fd303$i$i = ((($add$ptr17$i$i)) + 8|0);
         HEAP32[$fd303$i$i>>2] = $add$ptr17$i$i;
         break;
        }
        $136 = HEAP32[$arrayidx287$i$i>>2]|0;
        $head3174$i$i = ((($136)) + 4|0);
        $137 = HEAP32[$head3174$i$i>>2]|0;
        $and3185$i$i = $137 & -8;
        $cmp3196$i$i = ($and3185$i$i|0)==($qsize$0$i$i|0);
        L291: do {
         if ($cmp3196$i$i) {
          $T$0$lcssa$i34$i = $136;
         } else {
          $cmp306$i$i = ($I252$0$i$i|0)==(31);
          $shr310$i$i = $I252$0$i$i >>> 1;
          $sub313$i$i = (25 - ($shr310$i$i))|0;
          $cond315$i$i = $cmp306$i$i ? 0 : $sub313$i$i;
          $shl316$i$i = $qsize$0$i$i << $cond315$i$i;
          $K305$08$i$i = $shl316$i$i;$T$07$i$i = $136;
          while(1) {
           $shr323$i$i = $K305$08$i$i >>> 31;
           $arrayidx325$i$i = (((($T$07$i$i)) + 16|0) + ($shr323$i$i<<2)|0);
           $138 = HEAP32[$arrayidx325$i$i>>2]|0;
           $cmp327$i$i = ($138|0)==(0|0);
           if ($cmp327$i$i) {
            break;
           }
           $shl326$i$i = $K305$08$i$i << 1;
           $head317$i$i = ((($138)) + 4|0);
           $139 = HEAP32[$head317$i$i>>2]|0;
           $and318$i$i = $139 & -8;
           $cmp319$i$i = ($and318$i$i|0)==($qsize$0$i$i|0);
           if ($cmp319$i$i) {
            $T$0$lcssa$i34$i = $138;
            break L291;
           } else {
            $K305$08$i$i = $shl326$i$i;$T$07$i$i = $138;
           }
          }
          HEAP32[$arrayidx325$i$i>>2] = $add$ptr17$i$i;
          $parent337$i$i = ((($add$ptr17$i$i)) + 24|0);
          HEAP32[$parent337$i$i>>2] = $T$07$i$i;
          $bk338$i$i = ((($add$ptr17$i$i)) + 12|0);
          HEAP32[$bk338$i$i>>2] = $add$ptr17$i$i;
          $fd339$i$i = ((($add$ptr17$i$i)) + 8|0);
          HEAP32[$fd339$i$i>>2] = $add$ptr17$i$i;
          break L238;
         }
        } while(0);
        $fd344$i$i = ((($T$0$lcssa$i34$i)) + 8|0);
        $140 = HEAP32[$fd344$i$i>>2]|0;
        $bk357$i$i = ((($140)) + 12|0);
        HEAP32[$bk357$i$i>>2] = $add$ptr17$i$i;
        HEAP32[$fd344$i$i>>2] = $add$ptr17$i$i;
        $fd359$i$i = ((($add$ptr17$i$i)) + 8|0);
        HEAP32[$fd359$i$i>>2] = $140;
        $bk360$i$i = ((($add$ptr17$i$i)) + 12|0);
        HEAP32[$bk360$i$i>>2] = $T$0$lcssa$i34$i;
        $parent361$i$i = ((($add$ptr17$i$i)) + 24|0);
        HEAP32[$parent361$i$i>>2] = 0;
       }
      } while(0);
      $add$ptr369$i$i = ((($add$ptr4$i$i)) + 8|0);
      $retval$0 = $add$ptr369$i$i;
      STACKTOP = sp;return ($retval$0|0);
     }
    }
    $sp$0$i$i$i = (3220);
    while(1) {
     $141 = HEAP32[$sp$0$i$i$i>>2]|0;
     $cmp$i$i$i = ($141>>>0)>($92>>>0);
     if (!($cmp$i$i$i)) {
      $size$i$i$i = ((($sp$0$i$i$i)) + 4|0);
      $142 = HEAP32[$size$i$i$i>>2]|0;
      $add$ptr$i$i$i = (($141) + ($142)|0);
      $cmp2$i$i$i = ($add$ptr$i$i$i>>>0)>($92>>>0);
      if ($cmp2$i$i$i) {
       break;
      }
     }
     $next$i$i$i = ((($sp$0$i$i$i)) + 8|0);
     $143 = HEAP32[$next$i$i$i>>2]|0;
     $sp$0$i$i$i = $143;
    }
    $add$ptr2$i$i = ((($add$ptr$i$i$i)) + -47|0);
    $add$ptr3$i$i = ((($add$ptr2$i$i)) + 8|0);
    $144 = $add$ptr3$i$i;
    $and$i$i = $144 & 7;
    $cmp$i12$i = ($and$i$i|0)==(0);
    $sub$i$i = (0 - ($144))|0;
    $and6$i13$i = $sub$i$i & 7;
    $cond$i$i = $cmp$i12$i ? 0 : $and6$i13$i;
    $add$ptr7$i$i = (($add$ptr2$i$i) + ($cond$i$i)|0);
    $add$ptr81$i$i = ((($92)) + 16|0);
    $cmp9$i$i = ($add$ptr7$i$i>>>0)<($add$ptr81$i$i>>>0);
    $cond13$i$i = $cmp9$i$i ? $92 : $add$ptr7$i$i;
    $add$ptr14$i$i = ((($cond13$i$i)) + 8|0);
    $add$ptr15$i$i = ((($cond13$i$i)) + 24|0);
    $sub16$i$i = (($tsize$794$i) + -40)|0;
    $add$ptr$i2$i$i = ((($tbase$795$i)) + 8|0);
    $145 = $add$ptr$i2$i$i;
    $and$i$i$i = $145 & 7;
    $cmp$i3$i$i = ($and$i$i$i|0)==(0);
    $sub$i$i$i = (0 - ($145))|0;
    $and3$i$i$i = $sub$i$i$i & 7;
    $cond$i$i$i = $cmp$i3$i$i ? 0 : $and3$i$i$i;
    $add$ptr4$i$i$i = (($tbase$795$i) + ($cond$i$i$i)|0);
    $sub5$i$i$i = (($sub16$i$i) - ($cond$i$i$i))|0;
    HEAP32[(2796)>>2] = $add$ptr4$i$i$i;
    HEAP32[(2784)>>2] = $sub5$i$i$i;
    $or$i$i$i = $sub5$i$i$i | 1;
    $head$i$i$i = ((($add$ptr4$i$i$i)) + 4|0);
    HEAP32[$head$i$i$i>>2] = $or$i$i$i;
    $add$ptr6$i$i$i = (($tbase$795$i) + ($sub16$i$i)|0);
    $head7$i$i$i = ((($add$ptr6$i$i$i)) + 4|0);
    HEAP32[$head7$i$i$i>>2] = 40;
    $146 = HEAP32[(3260)>>2]|0;
    HEAP32[(2800)>>2] = $146;
    $head$i$i = ((($cond13$i$i)) + 4|0);
    HEAP32[$head$i$i>>2] = 27;
    ;HEAP32[$add$ptr14$i$i>>2]=HEAP32[(3220)>>2]|0;HEAP32[$add$ptr14$i$i+4>>2]=HEAP32[(3220)+4>>2]|0;HEAP32[$add$ptr14$i$i+8>>2]=HEAP32[(3220)+8>>2]|0;HEAP32[$add$ptr14$i$i+12>>2]=HEAP32[(3220)+12>>2]|0;
    HEAP32[(3220)>>2] = $tbase$795$i;
    HEAP32[(3224)>>2] = $tsize$794$i;
    HEAP32[(3232)>>2] = 0;
    HEAP32[(3228)>>2] = $add$ptr14$i$i;
    $147 = $add$ptr15$i$i;
    while(1) {
     $add$ptr24$i$i = ((($147)) + 4|0);
     HEAP32[$add$ptr24$i$i>>2] = 7;
     $head26$i$i = ((($147)) + 8|0);
     $cmp27$i$i = ($head26$i$i>>>0)<($add$ptr$i$i$i>>>0);
     if ($cmp27$i$i) {
      $147 = $add$ptr24$i$i;
     } else {
      break;
     }
    }
    $cmp28$i$i = ($cond13$i$i|0)==($92|0);
    if (!($cmp28$i$i)) {
     $sub$ptr$lhs$cast$i$i = $cond13$i$i;
     $sub$ptr$rhs$cast$i$i = $92;
     $sub$ptr$sub$i$i = (($sub$ptr$lhs$cast$i$i) - ($sub$ptr$rhs$cast$i$i))|0;
     $148 = HEAP32[$head$i$i>>2]|0;
     $and32$i$i = $148 & -2;
     HEAP32[$head$i$i>>2] = $and32$i$i;
     $or33$i$i = $sub$ptr$sub$i$i | 1;
     $head34$i$i = ((($92)) + 4|0);
     HEAP32[$head34$i$i>>2] = $or33$i$i;
     HEAP32[$cond13$i$i>>2] = $sub$ptr$sub$i$i;
     $shr$i$i = $sub$ptr$sub$i$i >>> 3;
     $cmp36$i$i = ($sub$ptr$sub$i$i>>>0)<(256);
     if ($cmp36$i$i) {
      $shl$i$i = $shr$i$i << 1;
      $arrayidx$i$i = (2812 + ($shl$i$i<<2)|0);
      $149 = HEAP32[693]|0;
      $shl39$i$i = 1 << $shr$i$i;
      $and40$i$i = $149 & $shl39$i$i;
      $tobool$i$i = ($and40$i$i|0)==(0);
      if ($tobool$i$i) {
       $or44$i$i = $149 | $shl39$i$i;
       HEAP32[693] = $or44$i$i;
       $$pre$i$i = ((($arrayidx$i$i)) + 8|0);
       $$pre$phi$i$iZ2D = $$pre$i$i;$F$0$i$i = $arrayidx$i$i;
      } else {
       $150 = ((($arrayidx$i$i)) + 8|0);
       $151 = HEAP32[$150>>2]|0;
       $$pre$phi$i$iZ2D = $150;$F$0$i$i = $151;
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $92;
      $bk$i$i = ((($F$0$i$i)) + 12|0);
      HEAP32[$bk$i$i>>2] = $92;
      $fd54$i$i = ((($92)) + 8|0);
      HEAP32[$fd54$i$i>>2] = $F$0$i$i;
      $bk55$i$i = ((($92)) + 12|0);
      HEAP32[$bk55$i$i>>2] = $arrayidx$i$i;
      break;
     }
     $shr58$i$i = $sub$ptr$sub$i$i >>> 8;
     $cmp59$i$i = ($shr58$i$i|0)==(0);
     if ($cmp59$i$i) {
      $I57$0$i$i = 0;
     } else {
      $cmp63$i$i = ($sub$ptr$sub$i$i>>>0)>(16777215);
      if ($cmp63$i$i) {
       $I57$0$i$i = 31;
      } else {
       $sub67$i$i = (($shr58$i$i) + 1048320)|0;
       $shr68$i$i = $sub67$i$i >>> 16;
       $and69$i$i = $shr68$i$i & 8;
       $shl70$i$i = $shr58$i$i << $and69$i$i;
       $sub71$i$i = (($shl70$i$i) + 520192)|0;
       $shr72$i$i = $sub71$i$i >>> 16;
       $and73$i$i = $shr72$i$i & 4;
       $add74$i$i = $and73$i$i | $and69$i$i;
       $shl75$i$i = $shl70$i$i << $and73$i$i;
       $sub76$i$i = (($shl75$i$i) + 245760)|0;
       $shr77$i$i = $sub76$i$i >>> 16;
       $and78$i$i = $shr77$i$i & 2;
       $add79$i$i = $add74$i$i | $and78$i$i;
       $sub80$i$i = (14 - ($add79$i$i))|0;
       $shl81$i$i = $shl75$i$i << $and78$i$i;
       $shr82$i$i = $shl81$i$i >>> 15;
       $add83$i$i = (($sub80$i$i) + ($shr82$i$i))|0;
       $shl84$i$i = $add83$i$i << 1;
       $add85$i$i = (($add83$i$i) + 7)|0;
       $shr86$i$i = $sub$ptr$sub$i$i >>> $add85$i$i;
       $and87$i$i = $shr86$i$i & 1;
       $add88$i$i = $and87$i$i | $shl84$i$i;
       $I57$0$i$i = $add88$i$i;
      }
     }
     $arrayidx91$i$i = (3076 + ($I57$0$i$i<<2)|0);
     $index$i$i = ((($92)) + 28|0);
     HEAP32[$index$i$i>>2] = $I57$0$i$i;
     $arrayidx92$i$i = ((($92)) + 20|0);
     HEAP32[$arrayidx92$i$i>>2] = 0;
     HEAP32[$add$ptr81$i$i>>2] = 0;
     $152 = HEAP32[(2776)>>2]|0;
     $shl95$i$i = 1 << $I57$0$i$i;
     $and96$i$i = $152 & $shl95$i$i;
     $tobool97$i$i = ($and96$i$i|0)==(0);
     if ($tobool97$i$i) {
      $or101$i$i = $152 | $shl95$i$i;
      HEAP32[(2776)>>2] = $or101$i$i;
      HEAP32[$arrayidx91$i$i>>2] = $92;
      $parent$i$i = ((($92)) + 24|0);
      HEAP32[$parent$i$i>>2] = $arrayidx91$i$i;
      $bk102$i$i = ((($92)) + 12|0);
      HEAP32[$bk102$i$i>>2] = $92;
      $fd103$i$i = ((($92)) + 8|0);
      HEAP32[$fd103$i$i>>2] = $92;
      break;
     }
     $153 = HEAP32[$arrayidx91$i$i>>2]|0;
     $head1186$i$i = ((($153)) + 4|0);
     $154 = HEAP32[$head1186$i$i>>2]|0;
     $and1197$i$i = $154 & -8;
     $cmp1208$i$i = ($and1197$i$i|0)==($sub$ptr$sub$i$i|0);
     L325: do {
      if ($cmp1208$i$i) {
       $T$0$lcssa$i$i = $153;
      } else {
       $cmp106$i$i = ($I57$0$i$i|0)==(31);
       $shr110$i$i = $I57$0$i$i >>> 1;
       $sub113$i$i = (25 - ($shr110$i$i))|0;
       $cond115$i$i = $cmp106$i$i ? 0 : $sub113$i$i;
       $shl116$i$i = $sub$ptr$sub$i$i << $cond115$i$i;
       $K105$010$i$i = $shl116$i$i;$T$09$i$i = $153;
       while(1) {
        $shr124$i$i = $K105$010$i$i >>> 31;
        $arrayidx126$i$i = (((($T$09$i$i)) + 16|0) + ($shr124$i$i<<2)|0);
        $155 = HEAP32[$arrayidx126$i$i>>2]|0;
        $cmp128$i$i = ($155|0)==(0|0);
        if ($cmp128$i$i) {
         break;
        }
        $shl127$i$i = $K105$010$i$i << 1;
        $head118$i$i = ((($155)) + 4|0);
        $156 = HEAP32[$head118$i$i>>2]|0;
        $and119$i$i = $156 & -8;
        $cmp120$i$i = ($and119$i$i|0)==($sub$ptr$sub$i$i|0);
        if ($cmp120$i$i) {
         $T$0$lcssa$i$i = $155;
         break L325;
        } else {
         $K105$010$i$i = $shl127$i$i;$T$09$i$i = $155;
        }
       }
       HEAP32[$arrayidx126$i$i>>2] = $92;
       $parent138$i$i = ((($92)) + 24|0);
       HEAP32[$parent138$i$i>>2] = $T$09$i$i;
       $bk139$i$i = ((($92)) + 12|0);
       HEAP32[$bk139$i$i>>2] = $92;
       $fd140$i$i = ((($92)) + 8|0);
       HEAP32[$fd140$i$i>>2] = $92;
       break L215;
      }
     } while(0);
     $fd148$i$i = ((($T$0$lcssa$i$i)) + 8|0);
     $157 = HEAP32[$fd148$i$i>>2]|0;
     $bk158$i$i = ((($157)) + 12|0);
     HEAP32[$bk158$i$i>>2] = $92;
     HEAP32[$fd148$i$i>>2] = $92;
     $fd160$i$i = ((($92)) + 8|0);
     HEAP32[$fd160$i$i>>2] = $157;
     $bk161$i$i = ((($92)) + 12|0);
     HEAP32[$bk161$i$i>>2] = $T$0$lcssa$i$i;
     $parent162$i$i = ((($92)) + 24|0);
     HEAP32[$parent162$i$i>>2] = 0;
    }
   }
  } while(0);
  $158 = HEAP32[(2784)>>2]|0;
  $cmp257$i = ($158>>>0)>($nb$0>>>0);
  if ($cmp257$i) {
   $sub260$i = (($158) - ($nb$0))|0;
   HEAP32[(2784)>>2] = $sub260$i;
   $159 = HEAP32[(2796)>>2]|0;
   $add$ptr262$i = (($159) + ($nb$0)|0);
   HEAP32[(2796)>>2] = $add$ptr262$i;
   $or264$i = $sub260$i | 1;
   $head265$i = ((($add$ptr262$i)) + 4|0);
   HEAP32[$head265$i>>2] = $or264$i;
   $or267$i = $nb$0 | 3;
   $head268$i = ((($159)) + 4|0);
   HEAP32[$head268$i>>2] = $or267$i;
   $add$ptr269$i = ((($159)) + 8|0);
   $retval$0 = $add$ptr269$i;
   STACKTOP = sp;return ($retval$0|0);
  }
 }
 $call275$i = (___errno_location()|0);
 HEAP32[$call275$i>>2] = 48;
 $retval$0 = 0;
 STACKTOP = sp;return ($retval$0|0);
}
function _free($mem) {
 $mem = $mem|0;
 var $$pre = 0, $$pre$phiZ2D = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $F510$0 = 0, $I534$0 = 0, $K583$0266 = 0;
 var $R$1 = 0, $R$1$be = 0, $R$1$ph = 0, $R$3 = 0, $R332$1 = 0, $R332$1$be = 0, $R332$1$ph = 0, $R332$3 = 0, $RP$1 = 0, $RP$1$be = 0, $RP$1$ph = 0, $RP360$1 = 0, $RP360$1$be = 0, $RP360$1$ph = 0, $T$0$lcssa = 0, $T$0265 = 0, $add$ptr = 0, $add$ptr16 = 0, $add$ptr217 = 0, $add$ptr261 = 0;
 var $add$ptr482 = 0, $add$ptr498 = 0, $add$ptr6 = 0, $add17 = 0, $add246 = 0, $add258 = 0, $add267 = 0, $add550 = 0, $add555 = 0, $add559 = 0, $add561 = 0, $add564 = 0, $and12 = 0, $and140 = 0, $and210 = 0, $and215 = 0, $and232 = 0, $and240 = 0, $and266 = 0, $and301 = 0;
 var $and410 = 0, $and46 = 0, $and495 = 0, $and5 = 0, $and512 = 0, $and545 = 0, $and549 = 0, $and554 = 0, $and563 = 0, $and574 = 0, $and592 = 0, $and592263 = 0, $and8 = 0, $arrayidx108 = 0, $arrayidx113 = 0, $arrayidx130 = 0, $arrayidx149 = 0, $arrayidx157 = 0, $arrayidx157$sink = 0, $arrayidx182 = 0;
 var $arrayidx188 = 0, $arrayidx198 = 0, $arrayidx362 = 0, $arrayidx374 = 0, $arrayidx379 = 0, $arrayidx400 = 0, $arrayidx419 = 0, $arrayidx427 = 0, $arrayidx427$sink = 0, $arrayidx454 = 0, $arrayidx460 = 0, $arrayidx470 = 0, $arrayidx509 = 0, $arrayidx567 = 0, $arrayidx570 = 0, $arrayidx599 = 0, $arrayidx99 = 0, $bk = 0, $bk275 = 0, $bk321 = 0;
 var $bk333 = 0, $bk355 = 0, $bk529 = 0, $bk531 = 0, $bk580 = 0, $bk611 = 0, $bk631 = 0, $bk634 = 0, $bk66 = 0, $bk73 = 0, $bk94 = 0, $child = 0, $child171 = 0, $child361 = 0, $child443 = 0, $child569 = 0, $cmp = 0, $cmp$i = 0, $cmp100 = 0, $cmp104 = 0;
 var $cmp109 = 0, $cmp114 = 0, $cmp127 = 0, $cmp13 = 0, $cmp131 = 0, $cmp150 = 0, $cmp162 = 0, $cmp173 = 0, $cmp18 = 0, $cmp189 = 0, $cmp211 = 0, $cmp22 = 0, $cmp228 = 0, $cmp243 = 0, $cmp249 = 0, $cmp25 = 0, $cmp255 = 0, $cmp269 = 0, $cmp296 = 0, $cmp334 = 0;
 var $cmp363 = 0, $cmp368 = 0, $cmp375 = 0, $cmp380 = 0, $cmp395 = 0, $cmp401 = 0, $cmp42 = 0, $cmp420 = 0, $cmp432 = 0, $cmp445 = 0, $cmp461 = 0, $cmp484 = 0, $cmp502 = 0, $cmp536 = 0, $cmp540 = 0, $cmp584 = 0, $cmp593 = 0, $cmp593264 = 0, $cmp601 = 0, $cmp640 = 0;
 var $cmp74 = 0, $cond = 0, $cond254 = 0, $cond255 = 0, $dec = 0, $fd = 0, $fd273 = 0, $fd322 = 0, $fd338 = 0, $fd356 = 0, $fd530 = 0, $fd581 = 0, $fd612 = 0, $fd620 = 0, $fd633 = 0, $fd67 = 0, $fd78 = 0, $fd95 = 0, $head209 = 0, $head216 = 0;
 var $head231 = 0, $head248 = 0, $head260 = 0, $head4 = 0, $head481 = 0, $head497 = 0, $head591 = 0, $head591262 = 0, $idx$neg = 0, $index = 0, $index399 = 0, $index568 = 0, $neg = 0, $neg139 = 0, $neg300 = 0, $neg409 = 0, $next4$i = 0, $or = 0, $or247 = 0, $or259 = 0;
 var $or480 = 0, $or496 = 0, $or516 = 0, $or578 = 0, $p$1 = 0, $parent = 0, $parent170 = 0, $parent183 = 0, $parent199 = 0, $parent331 = 0, $parent442 = 0, $parent455 = 0, $parent471 = 0, $parent579 = 0, $parent610 = 0, $parent635 = 0, $psize$1 = 0, $psize$2 = 0, $shl138 = 0, $shl299 = 0;
 var $shl408 = 0, $shl45 = 0, $shl508 = 0, $shl511 = 0, $shl546 = 0, $shl551 = 0, $shl557 = 0, $shl560 = 0, $shl573 = 0, $shl590 = 0, $shl600 = 0, $shr = 0, $shr268 = 0, $shr501 = 0, $shr535 = 0, $shr544 = 0, $shr548 = 0, $shr553 = 0, $shr558 = 0, $shr562 = 0;
 var $shr586 = 0, $shr597 = 0, $sp$0$i = 0, $sp$0$in$i = 0, $sub = 0, $sub547 = 0, $sub552 = 0, $sub556 = 0, $sub589 = 0, $tobool233 = 0, $tobool241 = 0, $tobool513 = 0, $tobool575 = 0, $tobool9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($mem|0)==(0|0);
 if ($cmp) {
  return;
 }
 $add$ptr = ((($mem)) + -8|0);
 $0 = HEAP32[(2788)>>2]|0;
 $head4 = ((($mem)) + -4|0);
 $1 = HEAP32[$head4>>2]|0;
 $and5 = $1 & -8;
 $add$ptr6 = (($add$ptr) + ($and5)|0);
 $and8 = $1 & 1;
 $tobool9 = ($and8|0)==(0);
 do {
  if ($tobool9) {
   $2 = HEAP32[$add$ptr>>2]|0;
   $and12 = $1 & 3;
   $cmp13 = ($and12|0)==(0);
   if ($cmp13) {
    return;
   }
   $idx$neg = (0 - ($2))|0;
   $add$ptr16 = (($add$ptr) + ($idx$neg)|0);
   $add17 = (($2) + ($and5))|0;
   $cmp18 = ($add$ptr16>>>0)<($0>>>0);
   if ($cmp18) {
    return;
   }
   $3 = HEAP32[(2792)>>2]|0;
   $cmp22 = ($3|0)==($add$ptr16|0);
   if ($cmp22) {
    $head209 = ((($add$ptr6)) + 4|0);
    $20 = HEAP32[$head209>>2]|0;
    $and210 = $20 & 3;
    $cmp211 = ($and210|0)==(3);
    if (!($cmp211)) {
     $21 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
     break;
    }
    $add$ptr217 = (($add$ptr16) + ($add17)|0);
    $head216 = ((($add$ptr16)) + 4|0);
    $or = $add17 | 1;
    $and215 = $20 & -2;
    HEAP32[(2780)>>2] = $add17;
    HEAP32[$head209>>2] = $and215;
    HEAP32[$head216>>2] = $or;
    HEAP32[$add$ptr217>>2] = $add17;
    return;
   }
   $shr = $2 >>> 3;
   $cmp25 = ($2>>>0)<(256);
   if ($cmp25) {
    $fd = ((($add$ptr16)) + 8|0);
    $4 = HEAP32[$fd>>2]|0;
    $bk = ((($add$ptr16)) + 12|0);
    $5 = HEAP32[$bk>>2]|0;
    $cmp42 = ($5|0)==($4|0);
    if ($cmp42) {
     $shl45 = 1 << $shr;
     $neg = $shl45 ^ -1;
     $6 = HEAP32[693]|0;
     $and46 = $6 & $neg;
     HEAP32[693] = $and46;
     $21 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
     break;
    } else {
     $bk66 = ((($4)) + 12|0);
     HEAP32[$bk66>>2] = $5;
     $fd67 = ((($5)) + 8|0);
     HEAP32[$fd67>>2] = $4;
     $21 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
     break;
    }
   }
   $parent = ((($add$ptr16)) + 24|0);
   $7 = HEAP32[$parent>>2]|0;
   $bk73 = ((($add$ptr16)) + 12|0);
   $8 = HEAP32[$bk73>>2]|0;
   $cmp74 = ($8|0)==($add$ptr16|0);
   do {
    if ($cmp74) {
     $child = ((($add$ptr16)) + 16|0);
     $arrayidx99 = ((($child)) + 4|0);
     $10 = HEAP32[$arrayidx99>>2]|0;
     $cmp100 = ($10|0)==(0|0);
     if ($cmp100) {
      $11 = HEAP32[$child>>2]|0;
      $cmp104 = ($11|0)==(0|0);
      if ($cmp104) {
       $R$3 = 0;
       break;
      } else {
       $R$1$ph = $11;$RP$1$ph = $child;
      }
     } else {
      $R$1$ph = $10;$RP$1$ph = $arrayidx99;
     }
     $R$1 = $R$1$ph;$RP$1 = $RP$1$ph;
     while(1) {
      $arrayidx108 = ((($R$1)) + 20|0);
      $12 = HEAP32[$arrayidx108>>2]|0;
      $cmp109 = ($12|0)==(0|0);
      if ($cmp109) {
       $arrayidx113 = ((($R$1)) + 16|0);
       $13 = HEAP32[$arrayidx113>>2]|0;
       $cmp114 = ($13|0)==(0|0);
       if ($cmp114) {
        break;
       } else {
        $R$1$be = $13;$RP$1$be = $arrayidx113;
       }
      } else {
       $R$1$be = $12;$RP$1$be = $arrayidx108;
      }
      $R$1 = $R$1$be;$RP$1 = $RP$1$be;
     }
     HEAP32[$RP$1>>2] = 0;
     $R$3 = $R$1;
    } else {
     $fd78 = ((($add$ptr16)) + 8|0);
     $9 = HEAP32[$fd78>>2]|0;
     $bk94 = ((($9)) + 12|0);
     HEAP32[$bk94>>2] = $8;
     $fd95 = ((($8)) + 8|0);
     HEAP32[$fd95>>2] = $9;
     $R$3 = $8;
    }
   } while(0);
   $cmp127 = ($7|0)==(0|0);
   if ($cmp127) {
    $21 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
   } else {
    $index = ((($add$ptr16)) + 28|0);
    $14 = HEAP32[$index>>2]|0;
    $arrayidx130 = (3076 + ($14<<2)|0);
    $15 = HEAP32[$arrayidx130>>2]|0;
    $cmp131 = ($15|0)==($add$ptr16|0);
    if ($cmp131) {
     HEAP32[$arrayidx130>>2] = $R$3;
     $cond254 = ($R$3|0)==(0|0);
     if ($cond254) {
      $shl138 = 1 << $14;
      $neg139 = $shl138 ^ -1;
      $16 = HEAP32[(2776)>>2]|0;
      $and140 = $16 & $neg139;
      HEAP32[(2776)>>2] = $and140;
      $21 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
      break;
     }
    } else {
     $arrayidx149 = ((($7)) + 16|0);
     $17 = HEAP32[$arrayidx149>>2]|0;
     $cmp150 = ($17|0)==($add$ptr16|0);
     $arrayidx157 = ((($7)) + 20|0);
     $arrayidx157$sink = $cmp150 ? $arrayidx149 : $arrayidx157;
     HEAP32[$arrayidx157$sink>>2] = $R$3;
     $cmp162 = ($R$3|0)==(0|0);
     if ($cmp162) {
      $21 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
      break;
     }
    }
    $parent170 = ((($R$3)) + 24|0);
    HEAP32[$parent170>>2] = $7;
    $child171 = ((($add$ptr16)) + 16|0);
    $18 = HEAP32[$child171>>2]|0;
    $cmp173 = ($18|0)==(0|0);
    if (!($cmp173)) {
     $arrayidx182 = ((($R$3)) + 16|0);
     HEAP32[$arrayidx182>>2] = $18;
     $parent183 = ((($18)) + 24|0);
     HEAP32[$parent183>>2] = $R$3;
    }
    $arrayidx188 = ((($child171)) + 4|0);
    $19 = HEAP32[$arrayidx188>>2]|0;
    $cmp189 = ($19|0)==(0|0);
    if ($cmp189) {
     $21 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
    } else {
     $arrayidx198 = ((($R$3)) + 20|0);
     HEAP32[$arrayidx198>>2] = $19;
     $parent199 = ((($19)) + 24|0);
     HEAP32[$parent199>>2] = $R$3;
     $21 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
    }
   }
  } else {
   $21 = $add$ptr;$p$1 = $add$ptr;$psize$1 = $and5;
  }
 } while(0);
 $cmp228 = ($21>>>0)<($add$ptr6>>>0);
 if (!($cmp228)) {
  return;
 }
 $head231 = ((($add$ptr6)) + 4|0);
 $22 = HEAP32[$head231>>2]|0;
 $and232 = $22 & 1;
 $tobool233 = ($and232|0)==(0);
 if ($tobool233) {
  return;
 }
 $and240 = $22 & 2;
 $tobool241 = ($and240|0)==(0);
 if ($tobool241) {
  $23 = HEAP32[(2796)>>2]|0;
  $cmp243 = ($23|0)==($add$ptr6|0);
  if ($cmp243) {
   $24 = HEAP32[(2784)>>2]|0;
   $add246 = (($24) + ($psize$1))|0;
   HEAP32[(2784)>>2] = $add246;
   HEAP32[(2796)>>2] = $p$1;
   $or247 = $add246 | 1;
   $head248 = ((($p$1)) + 4|0);
   HEAP32[$head248>>2] = $or247;
   $25 = HEAP32[(2792)>>2]|0;
   $cmp249 = ($p$1|0)==($25|0);
   if (!($cmp249)) {
    return;
   }
   HEAP32[(2792)>>2] = 0;
   HEAP32[(2780)>>2] = 0;
   return;
  }
  $26 = HEAP32[(2792)>>2]|0;
  $cmp255 = ($26|0)==($add$ptr6|0);
  if ($cmp255) {
   $27 = HEAP32[(2780)>>2]|0;
   $add258 = (($27) + ($psize$1))|0;
   HEAP32[(2780)>>2] = $add258;
   HEAP32[(2792)>>2] = $21;
   $or259 = $add258 | 1;
   $head260 = ((($p$1)) + 4|0);
   HEAP32[$head260>>2] = $or259;
   $add$ptr261 = (($21) + ($add258)|0);
   HEAP32[$add$ptr261>>2] = $add258;
   return;
  }
  $and266 = $22 & -8;
  $add267 = (($and266) + ($psize$1))|0;
  $shr268 = $22 >>> 3;
  $cmp269 = ($22>>>0)<(256);
  do {
   if ($cmp269) {
    $fd273 = ((($add$ptr6)) + 8|0);
    $28 = HEAP32[$fd273>>2]|0;
    $bk275 = ((($add$ptr6)) + 12|0);
    $29 = HEAP32[$bk275>>2]|0;
    $cmp296 = ($29|0)==($28|0);
    if ($cmp296) {
     $shl299 = 1 << $shr268;
     $neg300 = $shl299 ^ -1;
     $30 = HEAP32[693]|0;
     $and301 = $30 & $neg300;
     HEAP32[693] = $and301;
     break;
    } else {
     $bk321 = ((($28)) + 12|0);
     HEAP32[$bk321>>2] = $29;
     $fd322 = ((($29)) + 8|0);
     HEAP32[$fd322>>2] = $28;
     break;
    }
   } else {
    $parent331 = ((($add$ptr6)) + 24|0);
    $31 = HEAP32[$parent331>>2]|0;
    $bk333 = ((($add$ptr6)) + 12|0);
    $32 = HEAP32[$bk333>>2]|0;
    $cmp334 = ($32|0)==($add$ptr6|0);
    do {
     if ($cmp334) {
      $child361 = ((($add$ptr6)) + 16|0);
      $arrayidx362 = ((($child361)) + 4|0);
      $34 = HEAP32[$arrayidx362>>2]|0;
      $cmp363 = ($34|0)==(0|0);
      if ($cmp363) {
       $35 = HEAP32[$child361>>2]|0;
       $cmp368 = ($35|0)==(0|0);
       if ($cmp368) {
        $R332$3 = 0;
        break;
       } else {
        $R332$1$ph = $35;$RP360$1$ph = $child361;
       }
      } else {
       $R332$1$ph = $34;$RP360$1$ph = $arrayidx362;
      }
      $R332$1 = $R332$1$ph;$RP360$1 = $RP360$1$ph;
      while(1) {
       $arrayidx374 = ((($R332$1)) + 20|0);
       $36 = HEAP32[$arrayidx374>>2]|0;
       $cmp375 = ($36|0)==(0|0);
       if ($cmp375) {
        $arrayidx379 = ((($R332$1)) + 16|0);
        $37 = HEAP32[$arrayidx379>>2]|0;
        $cmp380 = ($37|0)==(0|0);
        if ($cmp380) {
         break;
        } else {
         $R332$1$be = $37;$RP360$1$be = $arrayidx379;
        }
       } else {
        $R332$1$be = $36;$RP360$1$be = $arrayidx374;
       }
       $R332$1 = $R332$1$be;$RP360$1 = $RP360$1$be;
      }
      HEAP32[$RP360$1>>2] = 0;
      $R332$3 = $R332$1;
     } else {
      $fd338 = ((($add$ptr6)) + 8|0);
      $33 = HEAP32[$fd338>>2]|0;
      $bk355 = ((($33)) + 12|0);
      HEAP32[$bk355>>2] = $32;
      $fd356 = ((($32)) + 8|0);
      HEAP32[$fd356>>2] = $33;
      $R332$3 = $32;
     }
    } while(0);
    $cmp395 = ($31|0)==(0|0);
    if (!($cmp395)) {
     $index399 = ((($add$ptr6)) + 28|0);
     $38 = HEAP32[$index399>>2]|0;
     $arrayidx400 = (3076 + ($38<<2)|0);
     $39 = HEAP32[$arrayidx400>>2]|0;
     $cmp401 = ($39|0)==($add$ptr6|0);
     if ($cmp401) {
      HEAP32[$arrayidx400>>2] = $R332$3;
      $cond255 = ($R332$3|0)==(0|0);
      if ($cond255) {
       $shl408 = 1 << $38;
       $neg409 = $shl408 ^ -1;
       $40 = HEAP32[(2776)>>2]|0;
       $and410 = $40 & $neg409;
       HEAP32[(2776)>>2] = $and410;
       break;
      }
     } else {
      $arrayidx419 = ((($31)) + 16|0);
      $41 = HEAP32[$arrayidx419>>2]|0;
      $cmp420 = ($41|0)==($add$ptr6|0);
      $arrayidx427 = ((($31)) + 20|0);
      $arrayidx427$sink = $cmp420 ? $arrayidx419 : $arrayidx427;
      HEAP32[$arrayidx427$sink>>2] = $R332$3;
      $cmp432 = ($R332$3|0)==(0|0);
      if ($cmp432) {
       break;
      }
     }
     $parent442 = ((($R332$3)) + 24|0);
     HEAP32[$parent442>>2] = $31;
     $child443 = ((($add$ptr6)) + 16|0);
     $42 = HEAP32[$child443>>2]|0;
     $cmp445 = ($42|0)==(0|0);
     if (!($cmp445)) {
      $arrayidx454 = ((($R332$3)) + 16|0);
      HEAP32[$arrayidx454>>2] = $42;
      $parent455 = ((($42)) + 24|0);
      HEAP32[$parent455>>2] = $R332$3;
     }
     $arrayidx460 = ((($child443)) + 4|0);
     $43 = HEAP32[$arrayidx460>>2]|0;
     $cmp461 = ($43|0)==(0|0);
     if (!($cmp461)) {
      $arrayidx470 = ((($R332$3)) + 20|0);
      HEAP32[$arrayidx470>>2] = $43;
      $parent471 = ((($43)) + 24|0);
      HEAP32[$parent471>>2] = $R332$3;
     }
    }
   }
  } while(0);
  $or480 = $add267 | 1;
  $head481 = ((($p$1)) + 4|0);
  HEAP32[$head481>>2] = $or480;
  $add$ptr482 = (($21) + ($add267)|0);
  HEAP32[$add$ptr482>>2] = $add267;
  $44 = HEAP32[(2792)>>2]|0;
  $cmp484 = ($p$1|0)==($44|0);
  if ($cmp484) {
   HEAP32[(2780)>>2] = $add267;
   return;
  } else {
   $psize$2 = $add267;
  }
 } else {
  $and495 = $22 & -2;
  HEAP32[$head231>>2] = $and495;
  $or496 = $psize$1 | 1;
  $head497 = ((($p$1)) + 4|0);
  HEAP32[$head497>>2] = $or496;
  $add$ptr498 = (($21) + ($psize$1)|0);
  HEAP32[$add$ptr498>>2] = $psize$1;
  $psize$2 = $psize$1;
 }
 $shr501 = $psize$2 >>> 3;
 $cmp502 = ($psize$2>>>0)<(256);
 if ($cmp502) {
  $shl508 = $shr501 << 1;
  $arrayidx509 = (2812 + ($shl508<<2)|0);
  $45 = HEAP32[693]|0;
  $shl511 = 1 << $shr501;
  $and512 = $45 & $shl511;
  $tobool513 = ($and512|0)==(0);
  if ($tobool513) {
   $or516 = $45 | $shl511;
   HEAP32[693] = $or516;
   $$pre = ((($arrayidx509)) + 8|0);
   $$pre$phiZ2D = $$pre;$F510$0 = $arrayidx509;
  } else {
   $46 = ((($arrayidx509)) + 8|0);
   $47 = HEAP32[$46>>2]|0;
   $$pre$phiZ2D = $46;$F510$0 = $47;
  }
  HEAP32[$$pre$phiZ2D>>2] = $p$1;
  $bk529 = ((($F510$0)) + 12|0);
  HEAP32[$bk529>>2] = $p$1;
  $fd530 = ((($p$1)) + 8|0);
  HEAP32[$fd530>>2] = $F510$0;
  $bk531 = ((($p$1)) + 12|0);
  HEAP32[$bk531>>2] = $arrayidx509;
  return;
 }
 $shr535 = $psize$2 >>> 8;
 $cmp536 = ($shr535|0)==(0);
 if ($cmp536) {
  $I534$0 = 0;
 } else {
  $cmp540 = ($psize$2>>>0)>(16777215);
  if ($cmp540) {
   $I534$0 = 31;
  } else {
   $sub = (($shr535) + 1048320)|0;
   $shr544 = $sub >>> 16;
   $and545 = $shr544 & 8;
   $shl546 = $shr535 << $and545;
   $sub547 = (($shl546) + 520192)|0;
   $shr548 = $sub547 >>> 16;
   $and549 = $shr548 & 4;
   $add550 = $and549 | $and545;
   $shl551 = $shl546 << $and549;
   $sub552 = (($shl551) + 245760)|0;
   $shr553 = $sub552 >>> 16;
   $and554 = $shr553 & 2;
   $add555 = $add550 | $and554;
   $sub556 = (14 - ($add555))|0;
   $shl557 = $shl551 << $and554;
   $shr558 = $shl557 >>> 15;
   $add559 = (($sub556) + ($shr558))|0;
   $shl560 = $add559 << 1;
   $add561 = (($add559) + 7)|0;
   $shr562 = $psize$2 >>> $add561;
   $and563 = $shr562 & 1;
   $add564 = $and563 | $shl560;
   $I534$0 = $add564;
  }
 }
 $arrayidx567 = (3076 + ($I534$0<<2)|0);
 $index568 = ((($p$1)) + 28|0);
 HEAP32[$index568>>2] = $I534$0;
 $child569 = ((($p$1)) + 16|0);
 $arrayidx570 = ((($p$1)) + 20|0);
 HEAP32[$arrayidx570>>2] = 0;
 HEAP32[$child569>>2] = 0;
 $48 = HEAP32[(2776)>>2]|0;
 $shl573 = 1 << $I534$0;
 $and574 = $48 & $shl573;
 $tobool575 = ($and574|0)==(0);
 L112: do {
  if ($tobool575) {
   $or578 = $48 | $shl573;
   HEAP32[(2776)>>2] = $or578;
   HEAP32[$arrayidx567>>2] = $p$1;
   $parent579 = ((($p$1)) + 24|0);
   HEAP32[$parent579>>2] = $arrayidx567;
   $bk580 = ((($p$1)) + 12|0);
   HEAP32[$bk580>>2] = $p$1;
   $fd581 = ((($p$1)) + 8|0);
   HEAP32[$fd581>>2] = $p$1;
  } else {
   $49 = HEAP32[$arrayidx567>>2]|0;
   $head591262 = ((($49)) + 4|0);
   $50 = HEAP32[$head591262>>2]|0;
   $and592263 = $50 & -8;
   $cmp593264 = ($and592263|0)==($psize$2|0);
   L115: do {
    if ($cmp593264) {
     $T$0$lcssa = $49;
    } else {
     $cmp584 = ($I534$0|0)==(31);
     $shr586 = $I534$0 >>> 1;
     $sub589 = (25 - ($shr586))|0;
     $cond = $cmp584 ? 0 : $sub589;
     $shl590 = $psize$2 << $cond;
     $K583$0266 = $shl590;$T$0265 = $49;
     while(1) {
      $shr597 = $K583$0266 >>> 31;
      $arrayidx599 = (((($T$0265)) + 16|0) + ($shr597<<2)|0);
      $51 = HEAP32[$arrayidx599>>2]|0;
      $cmp601 = ($51|0)==(0|0);
      if ($cmp601) {
       break;
      }
      $shl600 = $K583$0266 << 1;
      $head591 = ((($51)) + 4|0);
      $52 = HEAP32[$head591>>2]|0;
      $and592 = $52 & -8;
      $cmp593 = ($and592|0)==($psize$2|0);
      if ($cmp593) {
       $T$0$lcssa = $51;
       break L115;
      } else {
       $K583$0266 = $shl600;$T$0265 = $51;
      }
     }
     HEAP32[$arrayidx599>>2] = $p$1;
     $parent610 = ((($p$1)) + 24|0);
     HEAP32[$parent610>>2] = $T$0265;
     $bk611 = ((($p$1)) + 12|0);
     HEAP32[$bk611>>2] = $p$1;
     $fd612 = ((($p$1)) + 8|0);
     HEAP32[$fd612>>2] = $p$1;
     break L112;
    }
   } while(0);
   $fd620 = ((($T$0$lcssa)) + 8|0);
   $53 = HEAP32[$fd620>>2]|0;
   $bk631 = ((($53)) + 12|0);
   HEAP32[$bk631>>2] = $p$1;
   HEAP32[$fd620>>2] = $p$1;
   $fd633 = ((($p$1)) + 8|0);
   HEAP32[$fd633>>2] = $53;
   $bk634 = ((($p$1)) + 12|0);
   HEAP32[$bk634>>2] = $T$0$lcssa;
   $parent635 = ((($p$1)) + 24|0);
   HEAP32[$parent635>>2] = 0;
  }
 } while(0);
 $54 = HEAP32[(2804)>>2]|0;
 $dec = (($54) + -1)|0;
 HEAP32[(2804)>>2] = $dec;
 $cmp640 = ($dec|0)==(0);
 if (!($cmp640)) {
  return;
 }
 $sp$0$in$i = (3228);
 while(1) {
  $sp$0$i = HEAP32[$sp$0$in$i>>2]|0;
  $cmp$i = ($sp$0$i|0)==(0|0);
  $next4$i = ((($sp$0$i)) + 8|0);
  if ($cmp$i) {
   break;
  } else {
   $sp$0$in$i = $next4$i;
  }
 }
 HEAP32[(2804)>>2] = -1;
 return;
}
function _sbrk($increment) {
 $increment = $increment|0;
 var $0 = 0, $1 = 0, $add = 0, $call = 0, $call1 = 0, $call2 = 0, $call4 = 0, $cmp = 0, $retval$1 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_emscripten_get_sbrk_ptr()|0);
 $0 = HEAP32[$call>>2]|0;
 $add = (($0) + ($increment))|0;
 $call1 = (_emscripten_get_heap_size()|0);
 $cmp = ($add>>>0)>($call1>>>0);
 if ($cmp) {
  $call2 = (_emscripten_resize_heap(($add|0))|0);
  $tobool = ($call2|0)==(0);
  if ($tobool) {
   $call4 = (___errno_location()|0);
   HEAP32[$call4>>2] = 48;
   $retval$1 = (-1);
   return ($retval$1|0);
  }
 }
 HEAP32[$call>>2] = $add;
 $1 = $0;
 $retval$1 = $1;
 return ($retval$1|0);
}
function _emscripten_get_sbrk_ptr() {
    return 3296;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >= 8192) {
      _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
      return dest|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      block_aligned_end = (aligned_end - 64)|0;

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}

  
function dynCall_i(index) {
  index = index|0;
  
  return FUNCTION_TABLE_i[index&1]()|0;
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&3](a1|0)|0;
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&1](a1|0,a2|0)|0;
}


function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&7](a1|0,a2|0,a3|0)|0;
}


function dynCall_iiiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  return FUNCTION_TABLE_iiiii[index&3](a1|0,a2|0,a3|0,a4|0)|0;
}


function dynCall_iiiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  return FUNCTION_TABLE_iiiiii[index&1](a1|0,a2|0,a3|0,a4|0,a5|0)|0;
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&0]();
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&15](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&7](a1|0,a2|0);
}


function dynCall_viii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  FUNCTION_TABLE_viii[index&3](a1|0,a2|0,a3|0);
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&7](a1|0,a2|0,a3|0,a4|0);
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&3](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&3](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}

function b0() {
 ; abort(0);return 0;
}
function b1(p0) {
 p0 = p0|0; abort(1);return 0;
}
function b2(p0,p1) {
 p0 = p0|0;p1 = p1|0; abort(2);return 0;
}
function b3(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; abort(3);return 0;
}
function b4(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; abort(4);return 0;
}
function b5(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; abort(5);return 0;
}
function b6() {
 ; abort(6);
}
function b7(p0) {
 p0 = p0|0; abort(7);
}
function b8(p0,p1) {
 p0 = p0|0;p1 = p1|0; abort(8);
}
function b9(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; abort(9);
}
function b10(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; abort(10);
}
function b11(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; abort(11);
}
function b12(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; abort(12);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b0,__ZN10emscripten8internal12operator_newI6QStateJEEEPT_DpOT0_];
var FUNCTION_TABLE_ii = [b1,__ZN10emscripten8internal13getActualTypeI6QStateEEPKvPT_,__ZN10emscripten8internal7InvokerIP6QStateJEE6invokeEPFS3_vE,b1];
var FUNCTION_TABLE_iii = [b2,__Z12peek_state_rRK6QStatei];
var FUNCTION_TABLE_iiii = [b3,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,__ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv,__ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv,__Z12peek_state_xRK6QStateii,__Z12peek_state_zRK6QStateii,__ZN10emscripten8internal7InvokerIcJRK6QStateiEE6invokeEPFcS4_iEPS2_i,b3];
var FUNCTION_TABLE_iiiii = [b4,__Z7measureR6QStatelib,__ZN10emscripten8internal7InvokerIcJRK6QStateiiEE6invokeEPFcS4_iiEPS2_ii,b4];
var FUNCTION_TABLE_iiiiii = [b5,__ZN10emscripten8internal7InvokerIiJR6QStatelibEE6invokeEPFiS3_libEPS2_lib];
var FUNCTION_TABLE_v = [b6];
var FUNCTION_TABLE_vi = [b7,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv123__fundamental_type_infoD0Ev,__ZN10__cxxabiv119__pointer_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN10emscripten8internal14raw_destructorI6QStateEEvPT_,__Z10free_stateR6QState,b7,b7,b7,b7,b7];
var FUNCTION_TABLE_vii = [b8,__Z9initstae_R6QStatel,__Z8hadamardR6QStatel,__Z5phaseR6QStatel,__Z10copy_stateR6QStateRKS_,__ZN10emscripten8internal7InvokerIvJR6QStateEE6invokeEPFvS3_EPS2_,b8,b8];
var FUNCTION_TABLE_viii = [b9,__Z4cnotR6QStatell,__ZN10emscripten8internal7InvokerIvJR6QStatelEE6invokeEPFvS3_lEPS2_l,__ZN10emscripten8internal7InvokerIvJR6QStateRKS2_EE6invokeEPFvS3_S5_EPS2_S9_];
var FUNCTION_TABLE_viiii = [b10,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZN10emscripten8internal7InvokerIvJR6QStatellEE6invokeEPFvS3_llEPS2_ll,b10,b10,b10];
var FUNCTION_TABLE_viiiii = [b11,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b12,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { ___embind_register_native_and_builtin_types: ___embind_register_native_and_builtin_types, ___errno_location: ___errno_location, ___getTypeName: ___getTypeName, _emscripten_get_sbrk_ptr: _emscripten_get_sbrk_ptr, _free: _free, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iii: dynCall_iii, dynCall_iiii: dynCall_iiii, dynCall_iiiii: dynCall_iiiii, dynCall_iiiiii: dynCall_iiiiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viii: dynCall_viii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, globalCtors: globalCtors, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(asmGlobalArg, asmLibraryArg, buffer);

var ___embind_register_native_and_builtin_types = Module["___embind_register_native_and_builtin_types"] = asm["___embind_register_native_and_builtin_types"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___getTypeName = Module["___getTypeName"] = asm["___getTypeName"];
var _emscripten_get_sbrk_ptr = Module["_emscripten_get_sbrk_ptr"] = asm["_emscripten_get_sbrk_ptr"];
var _free = Module["_free"] = asm["_free"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memset = Module["_memset"] = asm["_memset"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var globalCtors = Module["globalCtors"] = asm["globalCtors"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_iiiii = Module["dynCall_iiiii"] = asm["dynCall_iiiii"];
var dynCall_iiiiii = Module["dynCall_iiiiii"] = asm["dynCall_iiiiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;














































































if (memoryInitializer) {
  if (!isDataURI(memoryInitializer)) {
    memoryInitializer = locateFile(memoryInitializer);
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = readBinary(memoryInitializer);
    HEAPU8.set(data, GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      HEAPU8.set(data, GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    };
    var doBrowserLoad = function() {
      readAsync(memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    };
    var memoryInitializerBytes = tryParseAsDataURI(memoryInitializer);
    if (memoryInitializerBytes) {
      applyMemoryInitializer(memoryInitializerBytes.buffer);
    } else
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      var useRequest = function() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
          var data = tryParseAsDataURI(Module['memoryInitializerRequestURL']);
          if (data) {
            response = data.buffer;
          } else {
            // If you see this warning, the issue may be that you are using locateFile and defining it in JS. That
            // means that the HTML file doesn't know about it, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
          }
        }
        applyMemoryInitializer(response);
      };
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}


var calledRun;


/**
 * @constructor
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
}

var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!calledRun) run();
  if (!calledRun) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
};





/** @type {function(Array=)} */
function run(args) {
  args = args || arguments_;

  if (runDependencies > 0) {
    return;
  }


  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later

  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    if (calledRun) return;
    calledRun = true;

    if (ABORT) return;

    initRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();


    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else
  {
    doRun();
  }
}
Module['run'] = run;


function exit(status, implicit) {

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && noExitRuntime && status === 0) {
    return;
  }

  if (noExitRuntime) {
  } else {

    ABORT = true;
    EXITSTATUS = status;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  quit_(status, new ExitStatus(status));
}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}


  noExitRuntime = true;

run();





// {{MODULE_ADDITIONS}}



