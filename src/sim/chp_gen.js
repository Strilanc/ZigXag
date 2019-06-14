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

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_HAS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;
ENVIRONMENT_IS_WEB = typeof window === 'object';
ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
ENVIRONMENT_HAS_NODE = typeof process === 'object' && typeof require === 'function';
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
  } else {
    return scriptDirectory + path;
  }
}

if (ENVIRONMENT_IS_NODE) {
  scriptDirectory = __dirname + '/';

  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
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

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', abort);

  Module['quit'] = function(status) {
    process['exit'](status);
  };

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
} else
if (ENVIRONMENT_IS_SHELL) {


  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      var data = tryParseAsDataURI(f);
      if (data) {
        return intArrayToString(data);
      }
      return read(f);
    };
  }

  Module['readBinary'] = function readBinary(f) {
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
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status) {
      quit(status);
    }
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


  Module['read'] = function shell_read(url) {
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
    Module['readBinary'] = function readBinary(url) {
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

  Module['readAsync'] = function readAsync(url, onload, onerror) {
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

  Module['setWindowTitle'] = function(title) { document.title = title };
} else
{
}

// Set up the out() and err() hooks, which are how we can print to stdout or
// stderr, respectively.
// If the user provided Module.print or printErr, use that. Otherwise,
// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
var out = Module['print'] || (typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null));
var err = Module['printErr'] || (typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || out));

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message



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
        debugger;
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
}

var getTempRet0 = function() {
  return tempRet0;
}


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

// Potentially used for direct table calls.
var wasmTable;


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





function demangle(func) {
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
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

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}


var STATIC_BASE = 8,
    STACK_BASE = 3392,
    STACKTOP = STACK_BASE,
    STACK_MAX = 5246272,
    DYNAMIC_BASE = 5246272,
    DYNAMICTOP_PTR = 3360;




var TOTAL_STACK = 5242880;

var INITIAL_TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (INITIAL_TOTAL_MEMORY < TOTAL_STACK) err('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + INITIAL_TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory







// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(INITIAL_TOTAL_MEMORY);
  }
}
updateGlobalBufferViews();


HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;






// Endianness check (note: assumes compiler arch was little-endian)

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
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  if (runtimeInitialized) return;
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
  // compatibility - merge in anything from Module['postRun'] at this time
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





// === Body ===

var ASM_CONSTS = [];





// STATICTOP = STATIC_BASE + 3384;
/* global initializers */  __ATINIT__.push({ func: function() { globalCtors() } });


memoryInitializer = "data:application/octet-stream;base64,AAAAAAAAAACYAQAAUAAAAOgBAADoAQAA2AEAAFAAAADoAQAA2AEAAKgBAAAAAAAAAAAAAAAAAACwAQAAUAAAANgBAADYAQAATAIAAGADAAC4AgAAaAMAAAAAAABQAAAAuAIAAHEDAAABAAAAUAAAAEwCAAC+BQAATAIAAP0FAABMAgAAOwYAAEwCAACBBgAATAIAAL4GAABMAgAA3QYAAEwCAAD8BgAATAIAABsHAABMAgAAOgcAAEwCAABZBwAATAIAAHgHAABMAgAAtQcAAEwCAADUBwAA1AIAAOcHAAAAAAAAAQAAAPgAAAAAAAAATAIAACYIAADUAgAATAgAAAAAAAABAAAA+AAAAAAAAADUAgAAiwgAAAAAAAABAAAA+AAAAAAAAAB0AgAAggkAAEABAAAAAAAAdAIAAC8JAABQAQAAAAAAAEwCAABQCQAAdAIAAF0JAAAwAQAAAAAAAHQCAADICQAAQAEAAAAAAAB0AgAApAkAAGgBAAAAAAAAdAIAAOoJAABAAQAAAAAAAJwCAAASCgAAnAIAABQKAACcAgAAFwoAAJwCAAAZCgAAnAIAABsKAACcAgAAHQoAAJwCAAAfCgAAnAIAACEKAACcAgAAIwoAAJwCAAAlCgAAnAIAACcKAACcAgAAKQoAAJwCAAArCgAAnAIAAC0KAAB0AgAALwoAADABAAAAAAAAWAAAAJgBAABQAAAA6AEAAJgBAABQAAAAUAAAAFAAAACwAQAAUAAAANgBAAAAAAAAMAEAAAEAAAACAAAAAwAAAAQAAAABAAAAAQAAAAEAAAABAAAAAAAAAFgBAAABAAAABQAAAAMAAAAEAAAAAQAAAAIAAAACAAAAAgAAAAAAAACIAQAAAQAAAAYAAAADAAAABAAAAAIAAAAAAAAAeAEAAAEAAAAHAAAAAwAAAAQAAAADAAAAAAAAAAgCAAABAAAACAAAAAMAAAAEAAAAAQAAAAMAAAADAAAAAwAAAFFTdGF0ZQBpbml0X3N0YXRlAGNub3QAaGFkYW1hcmQAcGhhc2UAbWVhc3VyZQBmcmVlX3N0YXRlAGNsb25lX3N0YXRlAHBlZWtfc3RhdGVfeABwZWVrX3N0YXRlX3oAcGVla19zdGF0ZV9yADZRU3RhdGUAUDZRU3RhdGUAUEs2UVN0YXRlAGlpAHYAdmkAdmlpaQB2aWlpaQBpaWlpaWkAdmlpAGlpaQBpaWlpaQBpaWlpAHZvaWQAYm9vbABzdGQ6OnN0cmluZwBzdGQ6OmJhc2ljX3N0cmluZzx1bnNpZ25lZCBjaGFyPgBzdGQ6OndzdHJpbmcAZW1zY3JpcHRlbjo6dmFsAGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHNpZ25lZCBjaGFyPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBjaGFyPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxzaG9ydD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgc2hvcnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgaW50PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQ4X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQ4X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludDE2X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQzMl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8bG9uZyBkb3VibGU+AE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWVFRQBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxkb3VibGU+AE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWRFRQBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxmbG9hdD4ATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJZkVFAGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIGxvbmc+AE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SW1FRQBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxsb25nPgBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lsRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJakVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWlFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0l0RUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJc0VFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWhFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lhRUUAZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8Y2hhcj4ATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJY0VFAE4xMGVtc2NyaXB0ZW4zdmFsRQBOU3QzX18yMTJiYXNpY19zdHJpbmdJd05TXzExY2hhcl90cmFpdHNJd0VFTlNfOWFsbG9jYXRvckl3RUVFRQBOU3QzX18yMjFfX2Jhc2ljX3N0cmluZ19jb21tb25JTGIxRUVFAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0loTlNfMTFjaGFyX3RyYWl0c0loRUVOU185YWxsb2NhdG9ySWhFRUVFAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0ljTlNfMTFjaGFyX3RyYWl0c0ljRUVOU185YWxsb2NhdG9ySWNFRUVFAGRvdWJsZQBmbG9hdAB1bnNpZ25lZCBsb25nAGxvbmcAdW5zaWduZWQgaW50AGludAB1bnNpZ25lZCBzaG9ydABzaG9ydAB1bnNpZ25lZCBjaGFyAHNpZ25lZCBjaGFyAGNoYXIATjEwX19jeHhhYml2MTE2X19zaGltX3R5cGVfaW5mb0UAU3Q5dHlwZV9pbmZvAE4xMF9fY3h4YWJpdjEyMF9fc2lfY2xhc3NfdHlwZV9pbmZvRQBOMTBfX2N4eGFiaXYxMTdfX2NsYXNzX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTE5X19wb2ludGVyX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTE3X19wYmFzZV90eXBlX2luZm9FAE4xMF9fY3h4YWJpdjEyM19fZnVuZGFtZW50YWxfdHlwZV9pbmZvRQB2AERuAGIAYwBoAGEAcwB0AGkAagBsAG0AZgBkAE4xMF9fY3h4YWJpdjEyMV9fdm1pX2NsYXNzX3R5cGVfaW5mb0U=";





/* no memory initializer */
var tempDoublePtr = 3376

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
              var HEAP = getHeap();
              var length = value.length;
              var ptr = _malloc(4 + length * charSize);
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


  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
    }






  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      return value;
    }


  function abortOnCannotGrowMemory(requestedSize) {
      abort('OOM');
    }function _emscripten_resize_heap(requestedSize) {
      abortOnCannotGrowMemory(requestedSize);
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


var asmGlobalArg = { "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array }

var asmLibraryArg = {
  "a": abort,
  "b": setTempRet0,
  "c": getTempRet0,
  "d": ClassHandle,
  "e": ClassHandle_clone,
  "f": ClassHandle_delete,
  "g": ClassHandle_deleteLater,
  "h": ClassHandle_isAliasOf,
  "i": ClassHandle_isDeleted,
  "j": RegisteredClass,
  "k": RegisteredPointer,
  "l": RegisteredPointer_deleteObject,
  "m": RegisteredPointer_destructor,
  "n": RegisteredPointer_fromWireType,
  "o": RegisteredPointer_getPointee,
  "p": ___setErrNo,
  "q": __embind_register_bool,
  "r": __embind_register_class,
  "s": __embind_register_class_constructor,
  "t": __embind_register_emval,
  "u": __embind_register_float,
  "v": __embind_register_function,
  "w": __embind_register_integer,
  "x": __embind_register_memory_view,
  "y": __embind_register_std_string,
  "z": __embind_register_std_wstring,
  "A": __embind_register_void,
  "B": __emval_decref,
  "C": __emval_register,
  "D": _embind_repr,
  "E": _emscripten_get_heap_size,
  "F": _emscripten_memcpy_big,
  "G": _emscripten_resize_heap,
  "H": abortOnCannotGrowMemory,
  "I": attachFinalizer,
  "J": constNoSmartPtrRawPointerToWireType,
  "K": count_emval_handles,
  "L": craftInvokerFunction,
  "M": createNamedFunction,
  "N": detachFinalizer,
  "O": downcastPointer,
  "P": embind__requireFunction,
  "Q": embind_init_charCodes,
  "R": ensureOverloadTable,
  "S": exposePublicSymbol,
  "T": extendError,
  "U": floatReadValueFromPointer,
  "V": flushPendingDeletes,
  "W": genericPointerToWireType,
  "X": getBasestPointer,
  "Y": getInheritedInstance,
  "Z": getInheritedInstanceCount,
  "_": getLiveInheritedInstances,
  "$": getShiftFromSize,
  "aa": getTypeName,
  "ab": get_first_emval,
  "ac": heap32VectorToArray,
  "ad": init_ClassHandle,
  "ae": init_RegisteredPointer,
  "af": init_embind,
  "ag": init_emval,
  "ah": integerReadValueFromPointer,
  "ai": makeClassHandle,
  "aj": makeLegalFunctionName,
  "ak": new_,
  "al": nonConstNoSmartPtrRawPointerToWireType,
  "am": readLatin1String,
  "an": registerType,
  "ao": releaseClassHandle,
  "ap": replacePublicSymbol,
  "aq": runDestructor,
  "ar": runDestructors,
  "as": setDelayFunction,
  "at": shallowCopyInternalPointer,
  "au": simpleReadValueFromPointer,
  "av": throwBindingError,
  "aw": throwInstanceAlreadyDeleted,
  "ax": throwInternalError,
  "ay": throwUnboundTypeError,
  "az": upcastPointer,
  "aA": whenDependentTypesAreResolved,
  "aB": tempDoublePtr,
  "aC": DYNAMICTOP_PTR
}
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'use asm';

  var HEAP8 = new global.Int8Array(buffer),
  HEAP16 = new global.Int16Array(buffer),
  HEAP32 = new global.Int32Array(buffer),
  HEAPU8 = new global.Uint8Array(buffer),
  HEAPU16 = new global.Uint16Array(buffer),
  tempDoublePtr=env.aB|0,
  DYNAMICTOP_PTR=env.aC|0,
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
  ___setErrNo=env.p,
  __embind_register_bool=env.q,
  __embind_register_class=env.r,
  __embind_register_class_constructor=env.s,
  __embind_register_emval=env.t,
  __embind_register_float=env.u,
  __embind_register_function=env.v,
  __embind_register_integer=env.w,
  __embind_register_memory_view=env.x,
  __embind_register_std_string=env.y,
  __embind_register_std_wstring=env.z,
  __embind_register_void=env.A,
  __emval_decref=env.B,
  __emval_register=env.C,
  _embind_repr=env.D,
  _emscripten_get_heap_size=env.E,
  _emscripten_memcpy_big=env.F,
  _emscripten_resize_heap=env.G,
  abortOnCannotGrowMemory=env.H,
  attachFinalizer=env.I,
  constNoSmartPtrRawPointerToWireType=env.J,
  count_emval_handles=env.K,
  craftInvokerFunction=env.L,
  createNamedFunction=env.M,
  detachFinalizer=env.N,
  downcastPointer=env.O,
  embind__requireFunction=env.P,
  embind_init_charCodes=env.Q,
  ensureOverloadTable=env.R,
  exposePublicSymbol=env.S,
  extendError=env.T,
  floatReadValueFromPointer=env.U,
  flushPendingDeletes=env.V,
  genericPointerToWireType=env.W,
  getBasestPointer=env.X,
  getInheritedInstance=env.Y,
  getInheritedInstanceCount=env.Z,
  getLiveInheritedInstances=env._,
  getShiftFromSize=env.$,
  getTypeName=env.aa,
  get_first_emval=env.ab,
  heap32VectorToArray=env.ac,
  init_ClassHandle=env.ad,
  init_RegisteredPointer=env.ae,
  init_embind=env.af,
  init_emval=env.ag,
  integerReadValueFromPointer=env.ah,
  makeClassHandle=env.ai,
  makeLegalFunctionName=env.aj,
  new_=env.ak,
  nonConstNoSmartPtrRawPointerToWireType=env.al,
  readLatin1String=env.am,
  registerType=env.an,
  releaseClassHandle=env.ao,
  replacePublicSymbol=env.ap,
  runDestructor=env.aq,
  runDestructors=env.ar,
  setDelayFunction=env.as,
  shallowCopyInternalPointer=env.at,
  simpleReadValueFromPointer=env.au,
  throwBindingError=env.av,
  throwInstanceAlreadyDeleted=env.aw,
  throwInternalError=env.ax,
  throwUnboundTypeError=env.ay,
  upcastPointer=env.az,
  whenDependentTypesAreResolved=env.aA,
  STACKTOP = 3392,
  STACK_MAX = 5246272,
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
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $add = 0, $add74 = 0, $and = 0, $and13 = 0, $and24 = 0, $and29 = 0, $and3 = 0, $and35 = 0, $and41 = 0, $and57 = 0, $and63 = 0, $and69 = 0, $and7 = 0, $arrayidx = 0, $arrayidx10 = 0, $arrayidx11 = 0, $arrayidx12 = 0, $arrayidx18 = 0;
 var $arrayidx34 = 0, $arrayidx4 = 0, $arrayidx40 = 0, $arrayidx44 = 0, $arrayidx5 = 0, $arrayidx6 = 0, $arrayidx62 = 0, $arrayidx68 = 0, $arrayidx73 = 0, $cmp = 0, $cmp64 = 0, $i$065 = 0, $inc = 0, $mul = 0, $r = 0, $rem = 0, $rem75 = 0, $shr = 0, $shr1 = 0, $tobool = 0;
 var $tobool14 = 0, $tobool25 = 0, $tobool30 = 0, $tobool36 = 0, $tobool42 = 0, $tobool58 = 0, $tobool64 = 0, $tobool70 = 0, $x = 0, $xor = 0, $xor19 = 0, $z = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shr = $b >> 5;
 $shr1 = $c >> 5;
 $and = $b & 31;
 $arrayidx = (((($q)) + 16|0) + ($and<<2)|0);
 $0 = HEAP32[$arrayidx>>2]|0;
 $and3 = $c & 31;
 $arrayidx4 = (((($q)) + 16|0) + ($and3<<2)|0);
 $1 = HEAP32[$arrayidx4>>2]|0;
 $2 = HEAP32[$q>>2]|0;
 $cmp64 = ($2|0)>(0);
 if (!($cmp64)) {
  return;
 }
 $x = ((($q)) + 4|0);
 $3 = HEAP32[$x>>2]|0;
 $z = ((($q)) + 8|0);
 $4 = HEAP32[$z>>2]|0;
 $r = ((($q)) + 12|0);
 $5 = HEAP32[$r>>2]|0;
 $i$065 = 0;
 while(1) {
  $arrayidx5 = (($3) + ($i$065<<2)|0);
  $6 = HEAP32[$arrayidx5>>2]|0;
  $arrayidx6 = (($6) + ($shr<<2)|0);
  $7 = HEAP32[$arrayidx6>>2]|0;
  $and7 = $7 & $0;
  $tobool = ($and7|0)==(0);
  $arrayidx10 = (($6) + ($shr1<<2)|0);
  if (!($tobool)) {
   $8 = HEAP32[$arrayidx10>>2]|0;
   $xor = $8 ^ $1;
   HEAP32[$arrayidx10>>2] = $xor;
  }
  $arrayidx11 = (($4) + ($i$065<<2)|0);
  $9 = HEAP32[$arrayidx11>>2]|0;
  $arrayidx12 = (($9) + ($shr1<<2)|0);
  $10 = HEAP32[$arrayidx12>>2]|0;
  $and13 = $10 & $1;
  $tobool14 = ($and13|0)==(0);
  $arrayidx18 = (($9) + ($shr<<2)|0);
  if (!($tobool14)) {
   $11 = HEAP32[$arrayidx18>>2]|0;
   $xor19 = $11 ^ $0;
   HEAP32[$arrayidx18>>2] = $xor19;
  }
  $12 = HEAP32[$arrayidx6>>2]|0;
  $and24 = $12 & $0;
  $tobool25 = ($and24|0)==(0);
  if (!($tobool25)) {
   $13 = HEAP32[$arrayidx12>>2]|0;
   $and29 = $13 & $1;
   $tobool30 = ($and29|0)==(0);
   if (!($tobool30)) {
    $arrayidx34 = (($6) + ($shr1<<2)|0);
    $14 = HEAP32[$arrayidx34>>2]|0;
    $and35 = $14 & $1;
    $tobool36 = ($and35|0)==(0);
    if (!($tobool36)) {
     $arrayidx40 = (($9) + ($shr<<2)|0);
     $15 = HEAP32[$arrayidx40>>2]|0;
     $and41 = $15 & $0;
     $tobool42 = ($and41|0)==(0);
     if (!($tobool42)) {
      $arrayidx44 = (($5) + ($i$065<<2)|0);
      $16 = HEAP32[$arrayidx44>>2]|0;
      $add = (($16) + 2)|0;
      $rem = (($add|0) % 4)&-1;
      HEAP32[$arrayidx44>>2] = $rem;
     }
    }
   }
   $17 = HEAP32[$arrayidx12>>2]|0;
   $and57 = $17 & $1;
   $tobool58 = ($and57|0)==(0);
   if (!($tobool58)) {
    $arrayidx62 = (($6) + ($shr1<<2)|0);
    $18 = HEAP32[$arrayidx62>>2]|0;
    $and63 = $18 & $1;
    $tobool64 = ($and63|0)==(0);
    if ($tobool64) {
     $arrayidx68 = (($9) + ($shr<<2)|0);
     $19 = HEAP32[$arrayidx68>>2]|0;
     $and69 = $19 & $0;
     $tobool70 = ($and69|0)==(0);
     if ($tobool70) {
      $arrayidx73 = (($5) + ($i$065<<2)|0);
      $20 = HEAP32[$arrayidx73>>2]|0;
      $add74 = (($20) + 2)|0;
      $rem75 = (($add74|0) % 4)&-1;
      HEAP32[$arrayidx73>>2] = $rem75;
     }
    }
   }
  }
  $inc = (($i$065) + 1)|0;
  $21 = HEAP32[$q>>2]|0;
  $mul = $21 << 1;
  $cmp = ($inc|0)<($mul|0);
  if ($cmp) {
   $i$065 = $inc;
  } else {
   break;
  }
 }
 return;
}
function __Z8hadamardR6QStatel($q,$b) {
 $q = $q|0;
 $b = $b|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $and = 0, $and18 = 0, $and26 = 0, $and30 = 0, $and9 = 0, $arrayidx = 0;
 var $arrayidx2 = 0, $arrayidx3 = 0, $arrayidx32 = 0, $arrayidx7 = 0, $arrayidx8 = 0, $cmp = 0, $cmp39 = 0, $i$040 = 0, $inc = 0, $mul = 0, $or$cond = 0, $r = 0, $rem = 0, $shr = 0, $tobool = 0, $tobool31 = 0, $x = 0, $xor = 0, $xor13 = 0, $xor17 = 0;
 var $xor22 = 0, $z = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shr = $b >> 5;
 $and = $b & 31;
 $arrayidx = (((($q)) + 16|0) + ($and<<2)|0);
 $0 = HEAP32[$arrayidx>>2]|0;
 $1 = HEAP32[$q>>2]|0;
 $cmp39 = ($1|0)>(0);
 if (!($cmp39)) {
  return;
 }
 $x = ((($q)) + 4|0);
 $2 = HEAP32[$x>>2]|0;
 $z = ((($q)) + 8|0);
 $3 = HEAP32[$z>>2]|0;
 $r = ((($q)) + 12|0);
 $4 = HEAP32[$r>>2]|0;
 $i$040 = 0;
 while(1) {
  $arrayidx2 = (($2) + ($i$040<<2)|0);
  $5 = HEAP32[$arrayidx2>>2]|0;
  $arrayidx3 = (($5) + ($shr<<2)|0);
  $6 = HEAP32[$arrayidx3>>2]|0;
  $arrayidx7 = (($3) + ($i$040<<2)|0);
  $7 = HEAP32[$arrayidx7>>2]|0;
  $arrayidx8 = (($7) + ($shr<<2)|0);
  $8 = HEAP32[$arrayidx8>>2]|0;
  $xor = $8 ^ $6;
  $and9 = $xor & $0;
  $xor13 = $and9 ^ $6;
  HEAP32[$arrayidx3>>2] = $xor13;
  $9 = HEAP32[$arrayidx8>>2]|0;
  $xor17 = $9 ^ $6;
  $and18 = $xor17 & $0;
  $xor22 = $and18 ^ $9;
  HEAP32[$arrayidx8>>2] = $xor22;
  $10 = HEAP32[$arrayidx3>>2]|0;
  $and26 = $10 & $0;
  $tobool = ($and26|0)==(0);
  $and30 = $xor22 & $0;
  $tobool31 = ($and30|0)==(0);
  $or$cond = $tobool | $tobool31;
  if (!($or$cond)) {
   $arrayidx32 = (($4) + ($i$040<<2)|0);
   $11 = HEAP32[$arrayidx32>>2]|0;
   $add = (($11) + 2)|0;
   $rem = (($add|0) % 4)&-1;
   HEAP32[$arrayidx32>>2] = $rem;
  }
  $inc = (($i$040) + 1)|0;
  $12 = HEAP32[$q>>2]|0;
  $mul = $12 << 1;
  $cmp = ($inc|0)<($mul|0);
  if ($cmp) {
   $i$040 = $inc;
  } else {
   break;
  }
 }
 return;
}
function __Z5phaseR6QStatel($q,$b) {
 $q = $q|0;
 $b = $b|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $and = 0, $and4 = 0, $and7 = 0, $arrayidx = 0, $arrayidx17 = 0, $arrayidx18 = 0;
 var $arrayidx2 = 0, $arrayidx3 = 0, $arrayidx5 = 0, $arrayidx6 = 0, $arrayidx9 = 0, $cmp = 0, $cmp25 = 0, $i$026 = 0, $inc = 0, $mul = 0, $r = 0, $rem = 0, $shr = 0, $tobool = 0, $tobool8 = 0, $x = 0, $xor = 0, $z16 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shr = $b >> 5;
 $and = $b & 31;
 $arrayidx = (((($q)) + 16|0) + ($and<<2)|0);
 $0 = HEAP32[$arrayidx>>2]|0;
 $1 = HEAP32[$q>>2]|0;
 $cmp25 = ($1|0)>(0);
 if (!($cmp25)) {
  return;
 }
 $x = ((($q)) + 4|0);
 $2 = HEAP32[$x>>2]|0;
 $z16 = ((($q)) + 8|0);
 $3 = HEAP32[$z16>>2]|0;
 $r = ((($q)) + 12|0);
 $4 = HEAP32[$r>>2]|0;
 $i$026 = 0;
 while(1) {
  $arrayidx2 = (($2) + ($i$026<<2)|0);
  $5 = HEAP32[$arrayidx2>>2]|0;
  $arrayidx3 = (($5) + ($shr<<2)|0);
  $6 = HEAP32[$arrayidx3>>2]|0;
  $and4 = $6 & $0;
  $tobool = ($and4|0)==(0);
  if (!($tobool)) {
   $arrayidx5 = (($3) + ($i$026<<2)|0);
   $7 = HEAP32[$arrayidx5>>2]|0;
   $arrayidx6 = (($7) + ($shr<<2)|0);
   $8 = HEAP32[$arrayidx6>>2]|0;
   $and7 = $8 & $0;
   $tobool8 = ($and7|0)==(0);
   if (!($tobool8)) {
    $arrayidx9 = (($4) + ($i$026<<2)|0);
    $9 = HEAP32[$arrayidx9>>2]|0;
    $add = (($9) + 2)|0;
    $rem = (($add|0) % 4)&-1;
    HEAP32[$arrayidx9>>2] = $rem;
   }
  }
  $arrayidx17 = (($3) + ($i$026<<2)|0);
  $10 = HEAP32[$arrayidx17>>2]|0;
  $arrayidx18 = (($10) + ($shr<<2)|0);
  $11 = HEAP32[$arrayidx18>>2]|0;
  $xor = $11 ^ $and4;
  HEAP32[$arrayidx18>>2] = $xor;
  $inc = (($i$026) + 1)|0;
  $12 = HEAP32[$q>>2]|0;
  $mul = $12 << 1;
  $cmp = ($inc|0)<($mul|0);
  if ($cmp) {
   $i$026 = $inc;
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
 $over32 = ((($q)) + 144|0);
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
 var $$sink = 0, $$sink$in = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $and14$pn = 0, $arrayidx = 0, $arrayidx1 = 0, $arrayidx18 = 0, $arrayidx19 = 0, $arrayidx2 = 0, $arrayidx3 = 0, $arrayidx4 = 0;
 var $cmp = 0, $cmp25 = 0, $cmp5 = 0, $inc = 0, $j$026 = 0, $over32 = 0, $r = 0, $shr11$sink = 0, $shr11$sink$in = 0, $sub = 0, $x = 0, $x7 = 0, $z = 0, $z17 = 0, $z17$sink = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $over32 = ((($q)) + 144|0);
 $0 = HEAP32[$over32>>2]|0;
 $cmp25 = ($0|0)>(0);
 if ($cmp25) {
  $x = ((($q)) + 4|0);
  $1 = HEAP32[$x>>2]|0;
  $arrayidx = (($1) + ($i<<2)|0);
  $2 = HEAP32[$arrayidx>>2]|0;
  $z = ((($q)) + 8|0);
  $3 = HEAP32[$z>>2]|0;
  $arrayidx2 = (($3) + ($i<<2)|0);
  $4 = HEAP32[$arrayidx2>>2]|0;
  $j$026 = 0;
  while(1) {
   $arrayidx1 = (($2) + ($j$026<<2)|0);
   HEAP32[$arrayidx1>>2] = 0;
   $arrayidx3 = (($4) + ($j$026<<2)|0);
   HEAP32[$arrayidx3>>2] = 0;
   $inc = (($j$026) + 1)|0;
   $5 = HEAP32[$over32>>2]|0;
   $cmp = ($inc|0)<($5|0);
   if ($cmp) {
    $j$026 = $inc;
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
 $z17 = ((($q)) + 8|0);
 $x7 = ((($q)) + 4|0);
 $z17$sink = $cmp5 ? $x7 : $z17;
 $shr11$sink$in = $cmp5 ? $b : $sub;
 $and14$pn = $shr11$sink$in & 31;
 $$sink$in = (((($q)) + 16|0) + ($and14$pn<<2)|0);
 $$sink = HEAP32[$$sink$in>>2]|0;
 $shr11$sink = $shr11$sink$in >> 5;
 $8 = HEAP32[$z17$sink>>2]|0;
 $arrayidx18 = (($8) + ($i<<2)|0);
 $9 = HEAP32[$arrayidx18>>2]|0;
 $arrayidx19 = (($9) + ($shr11$sink<<2)|0);
 HEAP32[$arrayidx19>>2] = $$sink;
 return;
}
function __Z8cliffordR6QStatell($q,$i,$k) {
 $q = $q|0;
 $i = $i|0;
 $k = $k|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add126 = 0, $add129 = 0, $and = 0, $and113 = 0, $and14 = 0, $and32 = 0, $and46 = 0, $and52 = 0, $and58 = 0, $and87 = 0;
 var $and93 = 0, $and99 = 0, $arrayidx = 0, $arrayidx111 = 0, $arrayidx112 = 0, $arrayidx12 = 0, $arrayidx123 = 0, $arrayidx125 = 0, $arrayidx13 = 0, $arrayidx30 = 0, $arrayidx31 = 0, $arrayidx44 = 0, $arrayidx45 = 0, $arrayidx5 = 0, $arrayidx50 = 0, $arrayidx51 = 0, $arrayidx56 = 0, $arrayidx57 = 0, $arrayidx6 = 0, $arrayidx85 = 0;
 var $arrayidx86 = 0, $arrayidx91 = 0, $arrayidx92 = 0, $arrayidx97 = 0, $arrayidx98 = 0, $cmp = 0, $cmp100 = 0, $cmp127 = 0, $dec = 0, $dec116 = 0, $dec75 = 0, $e$0$lcssa = 0, $e$0102 = 0, $e$199 = 0, $e$3$ph = 0, $e$7 = 0, $exitcond = 0, $inc = 0, $inc102 = 0, $inc119 = 0;
 var $inc121 = 0, $inc61 = 0, $j$0101 = 0, $l$098 = 0, $not$tobool59 = 0, $over32 = 0, $r = 0, $rem = 0, $retval$0 = 0, $spec$select = 0, $spec$select90 = 0, $spec$select91 = 0, $spec$select92 = 0, $spec$select93 = 0, $spec$select94 = 0, $tobool = 0, $tobool100 = 0, $tobool114 = 0, $tobool15 = 0, $tobool33 = 0;
 var $tobool47 = 0, $tobool53 = 0, $tobool59 = 0, $tobool88 = 0, $tobool94 = 0, $x = 0, $z43 = 0, $z84 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $over32 = ((($q)) + 144|0);
 $0 = HEAP32[$over32>>2]|0;
 $cmp100 = ($0|0)>(0);
 if (!($cmp100)) {
  $e$0$lcssa = 0;
  $r = ((($q)) + 12|0);
  $26 = HEAP32[$r>>2]|0;
  $arrayidx123 = (($26) + ($i<<2)|0);
  $27 = HEAP32[$arrayidx123>>2]|0;
  $add = (($27) + ($e$0$lcssa))|0;
  $arrayidx125 = (($26) + ($k<<2)|0);
  $28 = HEAP32[$arrayidx125>>2]|0;
  $add126 = (($add) + ($28))|0;
  $rem = (($add126|0) % 4)&-1;
  $cmp127 = ($rem|0)>(-1);
  $add129 = (($rem) + 4)|0;
  $retval$0 = $cmp127 ? $rem : $add129;
  return ($retval$0|0);
 }
 $x = ((($q)) + 4|0);
 $1 = HEAP32[$x>>2]|0;
 $arrayidx5 = (($1) + ($k<<2)|0);
 $2 = HEAP32[$arrayidx5>>2]|0;
 $z84 = ((($q)) + 8|0);
 $3 = HEAP32[$z84>>2]|0;
 $arrayidx85 = (($3) + ($k<<2)|0);
 $4 = HEAP32[$arrayidx85>>2]|0;
 $arrayidx91 = (($1) + ($i<<2)|0);
 $arrayidx12 = (($1) + ($i<<2)|0);
 $arrayidx30 = (($3) + ($i<<2)|0);
 $z43 = ((($q)) + 8|0);
 $5 = HEAP32[$z43>>2]|0;
 $arrayidx44 = (($5) + ($k<<2)|0);
 $arrayidx97 = (($3) + ($i<<2)|0);
 $arrayidx111 = (($3) + ($i<<2)|0);
 $arrayidx50 = (($1) + ($i<<2)|0);
 $arrayidx56 = (($5) + ($i<<2)|0);
 $6 = HEAP32[$over32>>2]|0;
 $e$0102 = 0;$j$0101 = 0;
 while(1) {
  $arrayidx6 = (($2) + ($j$0101<<2)|0);
  $7 = HEAP32[$arrayidx6>>2]|0;
  $arrayidx86 = (($4) + ($j$0101<<2)|0);
  $8 = HEAP32[$arrayidx86>>2]|0;
  $e$199 = $e$0102;$l$098 = 0;
  while(1) {
   $arrayidx = (((($q)) + 16|0) + ($l$098<<2)|0);
   $9 = HEAP32[$arrayidx>>2]|0;
   $and = $7 & $9;
   $tobool = ($and|0)==(0);
   $and87 = $8 & $9;
   $tobool88 = ($and87|0)==(0);
   do {
    if ($tobool) {
     if ($tobool88) {
      $e$7 = $e$199;
     } else {
      $20 = HEAP32[$arrayidx91>>2]|0;
      $arrayidx92 = (($20) + ($j$0101<<2)|0);
      $21 = HEAP32[$arrayidx92>>2]|0;
      $and93 = $21 & $9;
      $tobool94 = ($and93|0)==(0);
      if ($tobool94) {
       $e$7 = $e$199;
      } else {
       $22 = HEAP32[$arrayidx97>>2]|0;
       $arrayidx98 = (($22) + ($j$0101<<2)|0);
       $23 = HEAP32[$arrayidx98>>2]|0;
       $and99 = $23 & $9;
       $tobool100 = ($and99|0)==(0);
       $inc102 = $tobool100&1;
       $spec$select93 = (($e$199) + ($inc102))|0;
       $24 = HEAP32[$arrayidx111>>2]|0;
       $arrayidx112 = (($24) + ($j$0101<<2)|0);
       $25 = HEAP32[$arrayidx112>>2]|0;
       $and113 = $25 & $9;
       $tobool114 = ($and113|0)!=(0);
       $dec116 = $tobool114 << 31 >> 31;
       $spec$select94 = (($spec$select93) + ($dec116))|0;
       $e$7 = $spec$select94;
      }
     }
    } else {
     do {
      if ($tobool88) {
       $10 = HEAP32[$arrayidx12>>2]|0;
       $arrayidx13 = (($10) + ($j$0101<<2)|0);
       $11 = HEAP32[$arrayidx13>>2]|0;
       $and14 = $11 & $9;
       $tobool15 = ($and14|0)==(0);
       $12 = HEAP32[$arrayidx30>>2]|0;
       $arrayidx31 = (($12) + ($j$0101<<2)|0);
       $13 = HEAP32[$arrayidx31>>2]|0;
       $and32 = $13 & $9;
       $tobool33 = ($and32|0)!=(0);
       if ($tobool15) {
        $dec = $tobool33 << 31 >> 31;
        $spec$select90 = (($e$199) + ($dec))|0;
        $e$3$ph = $spec$select90;
        break;
       } else {
        $inc = $tobool33&1;
        $spec$select = (($e$199) + ($inc))|0;
        $e$3$ph = $spec$select;
        break;
       }
      } else {
       $e$3$ph = $e$199;
      }
     } while(0);
     $14 = HEAP32[$arrayidx44>>2]|0;
     $arrayidx45 = (($14) + ($j$0101<<2)|0);
     $15 = HEAP32[$arrayidx45>>2]|0;
     $and46 = $15 & $9;
     $tobool47 = ($and46|0)==(0);
     if ($tobool47) {
      $e$7 = $e$3$ph;
     } else {
      $16 = HEAP32[$arrayidx50>>2]|0;
      $arrayidx51 = (($16) + ($j$0101<<2)|0);
      $17 = HEAP32[$arrayidx51>>2]|0;
      $and52 = $17 & $9;
      $tobool53 = ($and52|0)==(0);
      $18 = HEAP32[$arrayidx56>>2]|0;
      $arrayidx57 = (($18) + ($j$0101<<2)|0);
      $19 = HEAP32[$arrayidx57>>2]|0;
      $and58 = $19 & $9;
      $tobool59 = ($and58|0)==(0);
      if ($tobool53) {
       $not$tobool59 = $tobool59 ^ 1;
       $inc61 = $not$tobool59&1;
       $spec$select91 = (($e$3$ph) + ($inc61))|0;
       $e$7 = $spec$select91;
       break;
      } else {
       $dec75 = $tobool59 << 31 >> 31;
       $spec$select92 = (($e$3$ph) + ($dec75))|0;
       $e$7 = $spec$select92;
       break;
      }
     }
    }
   } while(0);
   $inc119 = (($l$098) + 1)|0;
   $exitcond = ($inc119|0)==(32);
   if ($exitcond) {
    break;
   } else {
    $e$199 = $e$7;$l$098 = $inc119;
   }
  }
  $inc121 = (($j$0101) + 1)|0;
  $cmp = ($inc121|0)<($6|0);
  if ($cmp) {
   $e$0102 = $e$7;$j$0101 = $inc121;
  } else {
   $e$0$lcssa = $e$7;
   break;
  }
 }
 $r = ((($q)) + 12|0);
 $26 = HEAP32[$r>>2]|0;
 $arrayidx123 = (($26) + ($i<<2)|0);
 $27 = HEAP32[$arrayidx123>>2]|0;
 $add = (($27) + ($e$0$lcssa))|0;
 $arrayidx125 = (($26) + ($k<<2)|0);
 $28 = HEAP32[$arrayidx125>>2]|0;
 $add126 = (($add) + ($28))|0;
 $rem = (($add126|0) % 4)&-1;
 $cmp127 = ($rem|0)>(-1);
 $add129 = (($rem) + 4)|0;
 $retval$0 = $cmp127 ? $rem : $add129;
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
 $over32 = ((($q)) + 144|0);
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
 var $$ = 0, $$64 = 0, $$lcssa = 0, $$lcssa66 = 0, $$lcssa67 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add12 = 0, $add14 = 0, $add16 = 0, $add19 = 0, $add39 = 0, $add65 = 0;
 var $add80 = 0, $and = 0, $and30 = 0, $and5 = 0, $and55 = 0, $and74 = 0, $arrayidx = 0, $arrayidx20 = 0, $arrayidx28 = 0, $arrayidx29 = 0, $arrayidx3 = 0, $arrayidx4 = 0, $arrayidx40 = 0, $arrayidx53 = 0, $arrayidx54 = 0, $arrayidx72 = 0, $arrayidx73 = 0, $arrayidx88 = 0, $cmp = 0, $cmp24 = 0;
 var $cmp2472 = 0, $cmp26 = 0, $cmp50 = 0, $cmp5078 = 0, $cmp69 = 0, $cmp6975 = 0, $cmp82 = 0, $cond = 0, $i$073 = 0, $i$1 = 0, $i$174 = 0, $i$176 = 0, $inc = 0, $inc35 = 0, $inc60 = 0, $m$0$lcssa = 0, $m$079 = 0, $mul = 0, $mul23 = 0, $mul63 = 0;
 var $mul78 = 0, $mul87 = 0, $p$083 = 0, $r = 0, $r85 = 0, $retval$0 = 0, $shr = 0, $tobool = 0, $tobool31 = 0, $tobool41 = 0, $tobool46 = 0, $tobool56 = 0, $tobool75 = 0, $tobool89 = 0, $x = 0, $x27 = 0, $x52 = 0, $x71 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shr = $b >> 5;
 $and = $b & 31;
 $arrayidx = (((($q)) + 16|0) + ($and<<2)|0);
 $0 = HEAP32[$arrayidx>>2]|0;
 $1 = HEAP32[$q>>2]|0;
 $cmp82 = ($1|0)>(0);
 L1: do {
  if ($cmp82) {
   $x = ((($q)) + 4|0);
   $2 = HEAP32[$x>>2]|0;
   $3 = HEAP32[$q>>2]|0;
   $4 = $1;$p$083 = 0;
   while(1) {
    $add = (($4) + ($p$083))|0;
    $arrayidx3 = (($2) + ($add<<2)|0);
    $5 = HEAP32[$arrayidx3>>2]|0;
    $arrayidx4 = (($5) + ($shr<<2)|0);
    $6 = HEAP32[$arrayidx4>>2]|0;
    $and5 = $6 & $0;
    $tobool = ($and5|0)==(0);
    if (!($tobool)) {
     break;
    }
    $inc = (($p$083) + 1)|0;
    $cmp = ($inc|0)<($3|0);
    if ($cmp) {
     $4 = $3;$p$083 = $inc;
    } else {
     $$lcssa67 = $3;
     break L1;
    }
   }
   $add12 = (($4) + ($p$083))|0;
   __Z7rowcopyR6QStatell($q,$p$083,$add12);
   $7 = HEAP32[$q>>2]|0;
   $add14 = (($7) + ($p$083))|0;
   $add16 = (($7) + ($b))|0;
   __Z6rowsetR6QStatell($q,$add14,$add16);
   $cond = $random_result&1;
   $mul = $cond << 1;
   $r = ((($q)) + 12|0);
   $8 = HEAP32[$r>>2]|0;
   $9 = HEAP32[$q>>2]|0;
   $add19 = (($9) + ($p$083))|0;
   $arrayidx20 = (($8) + ($add19<<2)|0);
   HEAP32[$arrayidx20>>2] = $mul;
   $10 = HEAP32[$q>>2]|0;
   $cmp2472 = ($10|0)>(0);
   if ($cmp2472) {
    $x27 = ((($q)) + 4|0);
    $i$073 = 0;
    while(1) {
     $cmp26 = ($i$073|0)==($p$083|0);
     if (!($cmp26)) {
      $11 = HEAP32[$x27>>2]|0;
      $arrayidx28 = (($11) + ($i$073<<2)|0);
      $12 = HEAP32[$arrayidx28>>2]|0;
      $arrayidx29 = (($12) + ($shr<<2)|0);
      $13 = HEAP32[$arrayidx29>>2]|0;
      $and30 = $13 & $0;
      $tobool31 = ($and30|0)==(0);
      if (!($tobool31)) {
       __Z7rowmultR6QStatell($q,$i$073,$p$083);
      }
     }
     $inc35 = (($i$073) + 1)|0;
     $14 = HEAP32[$q>>2]|0;
     $mul23 = $14 << 1;
     $cmp24 = ($inc35|0)<($mul23|0);
     if ($cmp24) {
      $i$073 = $inc35;
     } else {
      $$lcssa = $14;
      break;
     }
    }
   } else {
    $$lcssa = $10;
   }
   $15 = HEAP32[$r>>2]|0;
   $add39 = (($$lcssa) + ($p$083))|0;
   $arrayidx40 = (($15) + ($add39<<2)|0);
   $16 = HEAP32[$arrayidx40>>2]|0;
   $tobool41 = ($16|0)==(0);
   $$ = $tobool41 ? 2 : 3;
   $retval$0 = $$;
   return ($retval$0|0);
  } else {
   $$lcssa67 = $1;
  }
 } while(0);
 $tobool46 = ($sup|0)==(0);
 if (!($tobool46)) {
  $retval$0 = 0;
  return ($retval$0|0);
 }
 $cmp5078 = ($$lcssa67|0)>(0);
 L21: do {
  if ($cmp5078) {
   $x52 = ((($q)) + 4|0);
   $17 = HEAP32[$x52>>2]|0;
   $m$079 = 0;
   while(1) {
    $arrayidx53 = (($17) + ($m$079<<2)|0);
    $18 = HEAP32[$arrayidx53>>2]|0;
    $arrayidx54 = (($18) + ($shr<<2)|0);
    $19 = HEAP32[$arrayidx54>>2]|0;
    $and55 = $19 & $0;
    $tobool56 = ($and55|0)==(0);
    if (!($tobool56)) {
     $m$0$lcssa = $m$079;
     break L21;
    }
    $inc60 = (($m$079) + 1)|0;
    $cmp50 = ($inc60|0)<($$lcssa67|0);
    if ($cmp50) {
     $m$079 = $inc60;
    } else {
     $m$0$lcssa = $inc60;
     break;
    }
   }
  } else {
   $m$0$lcssa = 0;
  }
 } while(0);
 $mul63 = $$lcssa67 << 1;
 $add65 = (($m$0$lcssa) + ($$lcssa67))|0;
 __Z7rowcopyR6QStatell($q,$mul63,$add65);
 $i$174 = (($m$0$lcssa) + 1)|0;
 $20 = HEAP32[$q>>2]|0;
 $cmp6975 = ($i$174|0)<($20|0);
 if ($cmp6975) {
  $x71 = ((($q)) + 4|0);
  $24 = $20;$i$176 = $i$174;
  while(1) {
   $21 = HEAP32[$x71>>2]|0;
   $arrayidx72 = (($21) + ($i$176<<2)|0);
   $22 = HEAP32[$arrayidx72>>2]|0;
   $arrayidx73 = (($22) + ($shr<<2)|0);
   $23 = HEAP32[$arrayidx73>>2]|0;
   $and74 = $23 & $0;
   $tobool75 = ($and74|0)==(0);
   if (!($tobool75)) {
    $add80 = (($i$176) + ($24))|0;
    $mul78 = $24 << 1;
    __Z7rowmultR6QStatell($q,$mul78,$add80);
   }
   $i$1 = (($i$176) + 1)|0;
   $25 = HEAP32[$q>>2]|0;
   $cmp69 = ($i$1|0)<($25|0);
   if ($cmp69) {
    $24 = $25;$i$176 = $i$1;
   } else {
    $$lcssa66 = $25;
    break;
   }
  }
 } else {
  $$lcssa66 = $20;
 }
 $r85 = ((($q)) + 12|0);
 $26 = HEAP32[$r85>>2]|0;
 $mul87 = $$lcssa66 << 1;
 $arrayidx88 = (($26) + ($mul87<<2)|0);
 $27 = HEAP32[$arrayidx88>>2]|0;
 $tobool89 = ($27|0)!=(0);
 $$64 = $tobool89&1;
 $retval$0 = $$64;
 return ($retval$0|0);
}
function __Z9initstae_R6QStatel($q,$n) {
 $q = $q|0;
 $n = $n|0;
 var $$sink = 0, $$sink$in = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var $add = 0, $add15 = 0, $add24 = 0, $add2455 = 0, $and65$pn = 0, $and65$pn$in = 0, $arrayidx = 0, $arrayidx20 = 0, $arrayidx20$1 = 0, $arrayidx20$10 = 0, $arrayidx20$11 = 0, $arrayidx20$12 = 0, $arrayidx20$13 = 0, $arrayidx20$14 = 0, $arrayidx20$15 = 0, $arrayidx20$16 = 0, $arrayidx20$17 = 0, $arrayidx20$18 = 0, $arrayidx20$19 = 0, $arrayidx20$2 = 0;
 var $arrayidx20$20 = 0, $arrayidx20$21 = 0, $arrayidx20$22 = 0, $arrayidx20$23 = 0, $arrayidx20$24 = 0, $arrayidx20$25 = 0, $arrayidx20$26 = 0, $arrayidx20$27 = 0, $arrayidx20$28 = 0, $arrayidx20$29 = 0, $arrayidx20$3 = 0, $arrayidx20$30 = 0, $arrayidx20$4 = 0, $arrayidx20$5 = 0, $arrayidx20$6 = 0, $arrayidx20$7 = 0, $arrayidx20$8 = 0, $arrayidx20$9 = 0, $arrayidx31 = 0, $arrayidx36 = 0;
 var $arrayidx42 = 0, $arrayidx43 = 0, $arrayidx45 = 0, $arrayidx46 = 0, $arrayidx55 = 0, $arrayidx57 = 0, $arrayidx68 = 0, $arrayidx70 = 0, $arrayidx70$sink = 0, $arrayidx73 = 0, $call = 0, $call13 = 0, $call29 = 0, $call34 = 0, $call8 = 0, $cmp25 = 0, $cmp2556 = 0, $cmp39 = 0, $cmp3952 = 0, $cmp51 = 0;
 var $cmp60 = 0, $i$157 = 0, $inc48 = 0, $inc75 = 0, $j$053 = 0, $mul = 0, $mul23 = 0, $mul2354 = 0, $mul28 = 0, $mul59 = 0, $over32 = 0, $r = 0, $shr = 0, $shr69 = 0, $sub63 = 0, $x = 0, $z = 0, label = 0, sp = 0;
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
 $over32 = ((($q)) + 144|0);
 HEAP32[$over32>>2] = $add15;
 $arrayidx = ((($q)) + 16|0);
 HEAP32[$arrayidx>>2] = 1;
 $arrayidx20 = ((($q)) + 20|0);
 HEAP32[$arrayidx20>>2] = 2;
 $arrayidx20$1 = ((($q)) + 24|0);
 HEAP32[$arrayidx20$1>>2] = 4;
 $arrayidx20$2 = ((($q)) + 28|0);
 HEAP32[$arrayidx20$2>>2] = 8;
 $arrayidx20$3 = ((($q)) + 32|0);
 HEAP32[$arrayidx20$3>>2] = 16;
 $arrayidx20$4 = ((($q)) + 36|0);
 HEAP32[$arrayidx20$4>>2] = 32;
 $arrayidx20$5 = ((($q)) + 40|0);
 HEAP32[$arrayidx20$5>>2] = 64;
 $arrayidx20$6 = ((($q)) + 44|0);
 HEAP32[$arrayidx20$6>>2] = 128;
 $arrayidx20$7 = ((($q)) + 48|0);
 HEAP32[$arrayidx20$7>>2] = 256;
 $arrayidx20$8 = ((($q)) + 52|0);
 HEAP32[$arrayidx20$8>>2] = 512;
 $arrayidx20$9 = ((($q)) + 56|0);
 HEAP32[$arrayidx20$9>>2] = 1024;
 $arrayidx20$10 = ((($q)) + 60|0);
 HEAP32[$arrayidx20$10>>2] = 2048;
 $arrayidx20$11 = ((($q)) + 64|0);
 HEAP32[$arrayidx20$11>>2] = 4096;
 $arrayidx20$12 = ((($q)) + 68|0);
 HEAP32[$arrayidx20$12>>2] = 8192;
 $arrayidx20$13 = ((($q)) + 72|0);
 HEAP32[$arrayidx20$13>>2] = 16384;
 $arrayidx20$14 = ((($q)) + 76|0);
 HEAP32[$arrayidx20$14>>2] = 32768;
 $arrayidx20$15 = ((($q)) + 80|0);
 HEAP32[$arrayidx20$15>>2] = 65536;
 $arrayidx20$16 = ((($q)) + 84|0);
 HEAP32[$arrayidx20$16>>2] = 131072;
 $arrayidx20$17 = ((($q)) + 88|0);
 HEAP32[$arrayidx20$17>>2] = 262144;
 $arrayidx20$18 = ((($q)) + 92|0);
 HEAP32[$arrayidx20$18>>2] = 524288;
 $arrayidx20$19 = ((($q)) + 96|0);
 HEAP32[$arrayidx20$19>>2] = 1048576;
 $arrayidx20$20 = ((($q)) + 100|0);
 HEAP32[$arrayidx20$20>>2] = 2097152;
 $arrayidx20$21 = ((($q)) + 104|0);
 HEAP32[$arrayidx20$21>>2] = 4194304;
 $arrayidx20$22 = ((($q)) + 108|0);
 HEAP32[$arrayidx20$22>>2] = 8388608;
 $arrayidx20$23 = ((($q)) + 112|0);
 HEAP32[$arrayidx20$23>>2] = 16777216;
 $arrayidx20$24 = ((($q)) + 116|0);
 HEAP32[$arrayidx20$24>>2] = 33554432;
 $arrayidx20$25 = ((($q)) + 120|0);
 HEAP32[$arrayidx20$25>>2] = 67108864;
 $arrayidx20$26 = ((($q)) + 124|0);
 HEAP32[$arrayidx20$26>>2] = 134217728;
 $arrayidx20$27 = ((($q)) + 128|0);
 HEAP32[$arrayidx20$27>>2] = 268435456;
 $arrayidx20$28 = ((($q)) + 132|0);
 HEAP32[$arrayidx20$28>>2] = 536870912;
 $arrayidx20$29 = ((($q)) + 136|0);
 HEAP32[$arrayidx20$29>>2] = 1073741824;
 $arrayidx20$30 = ((($q)) + 140|0);
 HEAP32[$arrayidx20$30>>2] = -2147483648;
 $0 = HEAP32[$q>>2]|0;
 $mul2354 = $0 << 1;
 $add2455 = $mul2354 | 1;
 $cmp2556 = ($add2455|0)>(0);
 if (!($cmp2556)) {
  return;
 }
 $i$157 = 0;
 while(1) {
  $1 = HEAP32[$over32>>2]|0;
  $mul28 = $1 << 2;
  $call29 = (_malloc($mul28)|0);
  $2 = HEAP32[$x>>2]|0;
  $arrayidx31 = (($2) + ($i$157<<2)|0);
  HEAP32[$arrayidx31>>2] = $call29;
  $call34 = (_malloc($mul28)|0);
  $3 = HEAP32[$z>>2]|0;
  $arrayidx36 = (($3) + ($i$157<<2)|0);
  HEAP32[$arrayidx36>>2] = $call34;
  $4 = HEAP32[$over32>>2]|0;
  $cmp3952 = ($4|0)>(0);
  if ($cmp3952) {
   $5 = HEAP32[$x>>2]|0;
   $arrayidx42 = (($5) + ($i$157<<2)|0);
   $6 = HEAP32[$arrayidx42>>2]|0;
   $7 = HEAP32[$z>>2]|0;
   $arrayidx45 = (($7) + ($i$157<<2)|0);
   $8 = HEAP32[$arrayidx45>>2]|0;
   $j$053 = 0;
   while(1) {
    $arrayidx43 = (($6) + ($j$053<<2)|0);
    HEAP32[$arrayidx43>>2] = 0;
    $arrayidx46 = (($8) + ($j$053<<2)|0);
    HEAP32[$arrayidx46>>2] = 0;
    $inc48 = (($j$053) + 1)|0;
    $9 = HEAP32[$over32>>2]|0;
    $cmp39 = ($inc48|0)<($9|0);
    if ($cmp39) {
     $j$053 = $inc48;
    } else {
     break;
    }
   }
  }
  $10 = HEAP32[$q>>2]|0;
  $cmp51 = ($i$157|0)<($10|0);
  if ($cmp51) {
   $11 = HEAP32[$x>>2]|0;
   $arrayidx55 = (($11) + ($i$157<<2)|0);
   $12 = HEAP32[$arrayidx55>>2]|0;
   $13 = $i$157 >>> 5;
   $arrayidx57 = (($12) + ($13<<2)|0);
   $and65$pn$in = $i$157;$arrayidx70$sink = $arrayidx57;
   label = 10;
  } else {
   $mul59 = $10 << 1;
   $cmp60 = ($i$157|0)<($mul59|0);
   if ($cmp60) {
    $sub63 = (($i$157) - ($10))|0;
    $14 = HEAP32[$z>>2]|0;
    $arrayidx68 = (($14) + ($i$157<<2)|0);
    $15 = HEAP32[$arrayidx68>>2]|0;
    $shr69 = $sub63 >> 5;
    $arrayidx70 = (($15) + ($shr69<<2)|0);
    $and65$pn$in = $sub63;$arrayidx70$sink = $arrayidx70;
    label = 10;
   }
  }
  if ((label|0) == 10) {
   label = 0;
   $and65$pn = $and65$pn$in & 31;
   $$sink$in = (((($q)) + 16|0) + ($and65$pn<<2)|0);
   $$sink = HEAP32[$$sink$in>>2]|0;
   HEAP32[$arrayidx70$sink>>2] = $$sink;
  }
  $16 = HEAP32[$r>>2]|0;
  $arrayidx73 = (($16) + ($i$157<<2)|0);
  HEAP32[$arrayidx73>>2] = 0;
  $inc75 = (($i$157) + 1)|0;
  $17 = HEAP32[$q>>2]|0;
  $mul23 = $17 << 1;
  $add24 = $mul23 | 1;
  $cmp25 = ($inc75|0)<($add24|0);
  if ($cmp25) {
   $i$157 = $inc75;
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
function __Z11clone_stateRK6QState($agg$result,$src) {
 $agg$result = $agg$result|0;
 $src = $src|0;
 var $0 = 0, $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $arraydecay = 0, $arraydecay4 = 0, $arrayidx = 0, $arrayidx22 = 0, $arrayidx26 = 0, $arrayidx32 = 0, $call = 0, $call11 = 0;
 var $call13 = 0, $call16 = 0, $call20 = 0, $cmp19 = 0, $exitcond = 0, $i$020 = 0, $inc = 0, $mul = 0, $mul15 = 0, $mul6 = 0, $over32 = 0, $over322 = 0, $r = 0, $r8 = 0, $x = 0, $x25 = 0, $z = 0, $z31 = 0, dest = 0, label = 0;
 var sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 $0 = HEAP32[$src>>2]|0;
 HEAP32[$agg$result>>2] = $0;
 $over32 = ((($src)) + 144|0);
 $1 = HEAP32[$over32>>2]|0;
 $over322 = ((($agg$result)) + 144|0);
 HEAP32[$over322>>2] = $1;
 $arraydecay = ((($agg$result)) + 16|0);
 $arraydecay4 = ((($src)) + 16|0);
 dest=$arraydecay; src=$arraydecay4; stop=dest+128|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
 $mul = $0 << 1;
 $add = $mul | 1;
 $mul6 = $add << 2;
 $call = (_malloc($mul6)|0);
 $r = ((($agg$result)) + 12|0);
 HEAP32[$r>>2] = $call;
 $r8 = ((($src)) + 12|0);
 $2 = HEAP32[$r8>>2]|0;
 _memcpy(($call|0),($2|0),($mul6|0))|0;
 $call11 = (_malloc($mul6)|0);
 $x = ((($agg$result)) + 4|0);
 HEAP32[$x>>2] = $call11;
 $call13 = (_malloc($mul6)|0);
 $z = ((($agg$result)) + 8|0);
 HEAP32[$z>>2] = $call13;
 $cmp19 = ($add|0)>(0);
 if (!($cmp19)) {
  return;
 }
 $mul15 = $1 << 2;
 $3 = HEAP32[$x>>2]|0;
 $4 = HEAP32[$z>>2]|0;
 $x25 = ((($src)) + 4|0);
 $z31 = ((($src)) + 8|0);
 $i$020 = 0;
 while(1) {
  $call16 = (_malloc($mul15)|0);
  $arrayidx = (($3) + ($i$020<<2)|0);
  HEAP32[$arrayidx>>2] = $call16;
  $call20 = (_malloc($mul15)|0);
  $arrayidx22 = (($4) + ($i$020<<2)|0);
  HEAP32[$arrayidx22>>2] = $call20;
  $5 = HEAP32[$arrayidx>>2]|0;
  $6 = HEAP32[$x25>>2]|0;
  $arrayidx26 = (($6) + ($i$020<<2)|0);
  $7 = HEAP32[$arrayidx26>>2]|0;
  _memcpy(($5|0),($7|0),($mul15|0))|0;
  $8 = HEAP32[$arrayidx22>>2]|0;
  $9 = HEAP32[$z31>>2]|0;
  $arrayidx32 = (($9) + ($i$020<<2)|0);
  $10 = HEAP32[$arrayidx32>>2]|0;
  _memcpy(($8|0),($10|0),($mul15|0))|0;
  $inc = (($i$020) + 1)|0;
  $exitcond = ($inc|0)==($add|0);
  if ($exitcond) {
   break;
  } else {
   $i$020 = $inc;
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
 var $args$i$i = 0, $call$i = 0, $call$i$i = 0, $call$i$i$i = 0, $call$i$i$i$i = 0, $call$i$i10$i = 0, $call$i$i11$i = 0, $call$i$i9$i = 0, $call2$i = 0, $call2$i$i = 0, $call3$i = 0, $call3$i$i = 0, $call4$i = 0, $call5$i = 0, $call6$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $args$i$i = sp;
 __ZN10emscripten8internal11NoBaseClass6verifyI6QStateEEvv();
 $call$i = (__ZN10emscripten8internal11NoBaseClass11getUpcasterI6QStateEEPFvvEv()|0);
 $call2$i = (__ZN10emscripten8internal11NoBaseClass13getDowncasterI6QStateEEPFvvEv()|0);
 $call3$i = (__ZN10emscripten8internal6TypeIDI6QStateE3getEv()|0);
 $call4$i = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI6QStateEEE3getEv()|0);
 $call5$i = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK6QStateEEE3getEv()|0);
 $call6$i = (__ZN10emscripten8internal11NoBaseClass3getEv()|0);
 $call$i$i$i = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0);
 $call$i$i9$i = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0);
 $call$i$i10$i = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0);
 $call$i$i11$i = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0);
 __embind_register_class(($call3$i|0),($call4$i|0),($call5$i|0),($call6$i|0),($call$i$i$i|0),(1|0),($call$i$i9$i|0),($call$i|0),($call$i$i10$i|0),($call2$i|0),(756|0),($call$i$i11$i|0),(9|0));
 $call$i$i = (__ZN10emscripten8internal6TypeIDI6QStateE3getEv()|0);
 $call2$i$i = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP6QStateEE8getCountEv($args$i$i)|0);
 $call3$i$i = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP6QStateEE8getTypesEv($args$i$i)|0);
 $call$i$i$i$i = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0);
 __embind_register_class_constructor(($call$i$i|0),($call2$i$i|0),($call3$i$i|0),($call$i$i$i$i|0),(2|0),(1|0));
 __ZN10emscripten8functionIvJR6QStatelEJEEEvPKcPFT_DpT0_EDpT1_(763,1);
 __ZN10emscripten8functionIvJR6QStatellEJEEEvPKcPFT_DpT0_EDpT1_(774,1);
 __ZN10emscripten8functionIvJR6QStatelEJEEEvPKcPFT_DpT0_EDpT1_(779,2);
 __ZN10emscripten8functionIvJR6QStatelEJEEEvPKcPFT_DpT0_EDpT1_(788,3);
 __ZN10emscripten8functionIiJR6QStatelibEJEEEvPKcPFT_DpT0_EDpT1_(794,1);
 __ZN10emscripten8functionIvJR6QStateEJEEEvPKcPFT_DpT0_EDpT1_(802,10);
 __ZN10emscripten8functionI6QStateJRKS1_EJEEEvPKcPFT_DpT0_EDpT1_(813,4);
 __ZN10emscripten8functionIcJRK6QStateiiEJEEEvPKcPFT_DpT0_EDpT1_(825,4);
 __ZN10emscripten8functionIcJRK6QStateiiEJEEEvPKcPFT_DpT0_EDpT1_(838,5);
 __ZN10emscripten8functionIcJRK6QStateiEJEEEvPKcPFT_DpT0_EDpT1_(851,1);
 STACKTOP = sp;return;
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
function __ZN10emscripten8functionI6QStateJRKS1_EJEEEvPKcPFT_DpT0_EDpT1_($name,$fn) {
 $name = $name|0;
 $fn = $fn|0;
 var $args = 0, $call = 0, $call$i$i = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0;
 $args = sp;
 $call = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJ6QStateRKS4_EE8getCountEv($args)|0);
 $call1 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJ6QStateRKS4_EE8getTypesEv($args)|0);
 $call$i$i = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 __embind_register_function(($name|0),($call|0),($call1|0),($call$i$i|0),(2|0),($fn|0));
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
function __ZN10emscripten8internal6TypeIDI6QStateE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDI6QStateE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI6QStateEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIP6QStateE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK6QStateEEE3getEv() {
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
 return (891|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (894|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (896|0);
}
function __ZN10emscripten8internal12operator_newI6QStateJEEEPT_DpOT0_() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__Znwm(148)|0);
 _memset(($call|0),0,148)|0;
 return ($call|0);
}
function __ZN10emscripten8internal7InvokerIP6QStateJEE6invokeEPFS3_vE($fn) {
 $fn = $fn|0;
 var $call = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (FUNCTION_TABLE_i[$fn & 1]()|0);
 $call1 = (__ZN10emscripten8internal11BindingTypeIP6QStateE10toWireTypeES3_($call)|0);
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
function __ZN10emscripten8internal11BindingTypeIP6QStateE10toWireTypeES3_($p) {
 $p = $p|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($p|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI6QStateEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (536|0);
}
function __ZN10emscripten8internal7InvokerIvJR6QStatelEE6invokeEPFvS3_lEPS2_l($fn,$args,$args1) {
 $fn = $fn|0;
 $args = $args|0;
 $args1 = $args1|0;
 var $call = 0, $call3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args)|0);
 $call3 = (__ZN10emscripten8internal11BindingTypeIlE12fromWireTypeEl($args1)|0);
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
function __ZN10emscripten8internal11BindingTypeIlE12fromWireTypeEl($v) {
 $v = $v|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($v|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvR6QStatelEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (540|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (899|0);
}
function __ZN10emscripten8internal7InvokerIvJR6QStatellEE6invokeEPFvS3_llEPS2_ll($fn,$args,$args1,$args3) {
 $fn = $fn|0;
 $args = $args|0;
 $args1 = $args1|0;
 $args3 = $args3|0;
 var $call = 0, $call5 = 0, $call6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args)|0);
 $call5 = (__ZN10emscripten8internal11BindingTypeIlE12fromWireTypeEl($args1)|0);
 $call6 = (__ZN10emscripten8internal11BindingTypeIlE12fromWireTypeEl($args3)|0);
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
 return (904|0);
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
 $call7 = (__ZN10emscripten8internal11BindingTypeIlE12fromWireTypeEl($args1)|0);
 $call8 = (__ZN10emscripten8internal11BindingTypeIiE12fromWireTypeEi($args3)|0);
 $call9 = (__ZN10emscripten8internal11BindingTypeIbE12fromWireTypeEb($args5)|0);
 $call10 = (FUNCTION_TABLE_iiiii[$fn & 3]($call,$call7,$call8,$call9)|0);
 HEAP32[$ref$tmp>>2] = $call10;
 $call11 = (__ZN10emscripten8internal11BindingTypeIiE10toWireTypeERKi($ref$tmp)|0);
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
function __ZN10emscripten8internal11BindingTypeIiE10toWireTypeERKi($v) {
 $v = $v|0;
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$v>>2]|0;
 return ($0|0);
}
function __ZN10emscripten8internal11BindingTypeIiE12fromWireTypeEi($v) {
 $v = $v|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($v|0);
}
function __ZN10emscripten8internal11BindingTypeIbE12fromWireTypeEb($wt) {
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
 return (910|0);
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
 return (552|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (917|0);
}
function __ZN10emscripten8internal7InvokerI6QStateJRKS2_EE6invokeEPFS2_S4_EPS2_($fn,$args) {
 $fn = $fn|0;
 $args = $args|0;
 var $call = 0, $call1 = 0, $ref$tmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0;
 $ref$tmp = sp;
 $call = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE12fromWireTypeEPS2_($args)|0);
 FUNCTION_TABLE_vii[$fn & 7]($ref$tmp,$call);
 $call1 = (__ZN10emscripten8internal18GenericBindingTypeI6QStateE10toWireTypeEOS2_($ref$tmp)|0);
 STACKTOP = sp;return ($call1|0);
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJ6QStateRKS4_EE8getCountEv($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJ6QStateRKS4_EE8getTypesEv($this) {
 $this = $this|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJ6QStateRKS3_EEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal18GenericBindingTypeI6QStateE10toWireTypeEOS2_($v) {
 $v = $v|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__Znwm(148)|0);
 _memcpy(($call|0),($v|0),148)|0;
 return ($call|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJ6QStateRKS3_EEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (560|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (921|0);
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
 $call5 = (__ZN10emscripten8internal11BindingTypeIiE12fromWireTypeEi($args1)|0);
 $call6 = (__ZN10emscripten8internal11BindingTypeIiE12fromWireTypeEi($args3)|0);
 $call7 = (FUNCTION_TABLE_iiii[$fn & 7]($call,$call5,$call6)|0);
 HEAP8[$ref$tmp>>0] = $call7;
 $call8 = (__ZN10emscripten8internal11BindingTypeIcE10toWireTypeERKc($ref$tmp)|0);
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
function __ZN10emscripten8internal11BindingTypeIcE10toWireTypeERKc($v) {
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
 return (925|0);
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
 $call3 = (__ZN10emscripten8internal11BindingTypeIiE12fromWireTypeEi($args1)|0);
 $call4 = (FUNCTION_TABLE_iii[$fn & 3]($call,$call3)|0);
 HEAP8[$ref$tmp>>0] = $call4;
 $call5 = (__ZN10emscripten8internal11BindingTypeIcE10toWireTypeERKc($ref$tmp)|0);
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
 return (568|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (931|0);
}
function __GLOBAL__sub_I_chp_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init();
 return;
}
function __GLOBAL__sub_I_bind_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init_2();
 return;
}
function ___cxx_global_var_init_2() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev(0);
 return;
}
function __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev($this) {
 $this = $this|0;
 var $call = 0, $call2 = 0, $call3 = 0, $call4 = 0, $call5 = 0, $call6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIvE3getEv()|0);
 __embind_register_void(($call|0),(936|0));
 $call2 = (__ZN10emscripten8internal6TypeIDIbE3getEv()|0);
 __embind_register_bool(($call2|0),(941|0),1,1,0);
 __ZN12_GLOBAL__N_116register_integerIcEEvPKc();
 __ZN12_GLOBAL__N_116register_integerIaEEvPKc();
 __ZN12_GLOBAL__N_116register_integerIhEEvPKc();
 __ZN12_GLOBAL__N_116register_integerIsEEvPKc();
 __ZN12_GLOBAL__N_116register_integerItEEvPKc();
 __ZN12_GLOBAL__N_116register_integerIiEEvPKc();
 __ZN12_GLOBAL__N_116register_integerIjEEvPKc();
 __ZN12_GLOBAL__N_116register_integerIlEEvPKc();
 __ZN12_GLOBAL__N_116register_integerImEEvPKc();
 __ZN12_GLOBAL__N_114register_floatIfEEvPKc();
 __ZN12_GLOBAL__N_114register_floatIdEEvPKc();
 $call3 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 __embind_register_std_string(($call3|0),(946|0));
 $call4 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0);
 __embind_register_std_string(($call4|0),(958|0));
 $call5 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0);
 __embind_register_std_wstring(($call5|0),4,(991|0));
 $call6 = (__ZN10emscripten8internal6TypeIDINS_3valEE3getEv()|0);
 __embind_register_emval(($call6|0),(1004|0));
 __ZN12_GLOBAL__N_120register_memory_viewIcEEvPKc();
 __ZN12_GLOBAL__N_120register_memory_viewIaEEvPKc(1020);
 __ZN12_GLOBAL__N_120register_memory_viewIhEEvPKc(1057);
 __ZN12_GLOBAL__N_120register_memory_viewIsEEvPKc(1096);
 __ZN12_GLOBAL__N_120register_memory_viewItEEvPKc(1127);
 __ZN12_GLOBAL__N_120register_memory_viewIiEEvPKc(1167);
 __ZN12_GLOBAL__N_120register_memory_viewIjEEvPKc(1196);
 __ZN12_GLOBAL__N_120register_memory_viewIlEEvPKc();
 __ZN12_GLOBAL__N_120register_memory_viewImEEvPKc();
 __ZN12_GLOBAL__N_120register_memory_viewIaEEvPKc(1234);
 __ZN12_GLOBAL__N_120register_memory_viewIhEEvPKc(1266);
 __ZN12_GLOBAL__N_120register_memory_viewIsEEvPKc(1299);
 __ZN12_GLOBAL__N_120register_memory_viewItEEvPKc(1332);
 __ZN12_GLOBAL__N_120register_memory_viewIiEEvPKc(1366);
 __ZN12_GLOBAL__N_120register_memory_viewIjEEvPKc(1399);
 __ZN12_GLOBAL__N_120register_memory_viewIfEEvPKc();
 __ZN12_GLOBAL__N_120register_memory_viewIdEEvPKc();
 __ZN12_GLOBAL__N_120register_memory_viewIeEEvPKc();
 return;
}
function __ZN10emscripten8internal6TypeIDIvE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIvE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDIbE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIbE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_116register_integerIcEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIcE3getEv()|0);
 __embind_register_integer(($call|0),(2346|0),1,-128,127);
 return;
}
function __ZN12_GLOBAL__N_116register_integerIaEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIaE3getEv()|0);
 __embind_register_integer(($call|0),(2334|0),1,-128,127);
 return;
}
function __ZN12_GLOBAL__N_116register_integerIhEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIhE3getEv()|0);
 __embind_register_integer(($call|0),(2320|0),1,0,255);
 return;
}
function __ZN12_GLOBAL__N_116register_integerIsEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIsE3getEv()|0);
 __embind_register_integer(($call|0),(2314|0),2,-32768,32767);
 return;
}
function __ZN12_GLOBAL__N_116register_integerItEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDItE3getEv()|0);
 __embind_register_integer(($call|0),(2299|0),2,0,65535);
 return;
}
function __ZN12_GLOBAL__N_116register_integerIiEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIiE3getEv()|0);
 __embind_register_integer(($call|0),(2295|0),4,-2147483648,2147483647);
 return;
}
function __ZN12_GLOBAL__N_116register_integerIjEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0);
 __embind_register_integer(($call|0),(2282|0),4,0,-1);
 return;
}
function __ZN12_GLOBAL__N_116register_integerIlEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIlE3getEv()|0);
 __embind_register_integer(($call|0),(2277|0),4,-2147483648,2147483647);
 return;
}
function __ZN12_GLOBAL__N_116register_integerImEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDImE3getEv()|0);
 __embind_register_integer(($call|0),(2263|0),4,0,-1);
 return;
}
function __ZN12_GLOBAL__N_114register_floatIfEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIfE3getEv()|0);
 __embind_register_float(($call|0),(2257|0),4);
 return;
}
function __ZN12_GLOBAL__N_114register_floatIdEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDIdE3getEv()|0);
 __embind_register_float(($call|0),(2250|0),8);
 return;
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal6TypeIDINS_3valEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv()|0);
 return ($call|0);
}
function __ZN12_GLOBAL__N_120register_memory_viewIcEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEE3getEv()|0);
 __embind_register_memory_view(($call|0),0,(1943|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIaEEvPKc($name) {
 $name = $name|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEE3getEv()|0);
 __embind_register_memory_view(($call|0),0,($name|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIhEEvPKc($name) {
 $name = $name|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEE3getEv()|0);
 __embind_register_memory_view(($call|0),1,($name|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIsEEvPKc($name) {
 $name = $name|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEE3getEv()|0);
 __embind_register_memory_view(($call|0),2,($name|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewItEEvPKc($name) {
 $name = $name|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewItEEE3getEv()|0);
 __embind_register_memory_view(($call|0),3,($name|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIiEEvPKc($name) {
 $name = $name|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEE3getEv()|0);
 __embind_register_memory_view(($call|0),4,($name|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIjEEvPKc($name) {
 $name = $name|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEE3getEv()|0);
 __embind_register_memory_view(($call|0),5,($name|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIlEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEE3getEv()|0);
 __embind_register_memory_view(($call|0),4,(1696|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewImEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewImEEE3getEv()|0);
 __embind_register_memory_view(($call|0),5,(1626|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIfEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEE3getEv()|0);
 __embind_register_memory_view(($call|0),6,(1564|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIdEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEE3getEv()|0);
 __embind_register_memory_view(($call|0),7,(1501|0));
 return;
}
function __ZN12_GLOBAL__N_120register_memory_viewIeEEvPKc() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEE3getEv()|0);
 __embind_register_memory_view(($call|0),7,(1433|0));
 return;
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (120|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (128|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (136|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewImEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (144|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (152|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (160|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (168|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewItEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (176|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (184|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (192|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (200|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (208|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (216|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (224|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (256|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (280|0);
}
function __ZN10emscripten8internal6TypeIDIdE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIdE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIdE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (512|0);
}
function __ZN10emscripten8internal6TypeIDIfE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIfE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIfE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (504|0);
}
function __ZN10emscripten8internal6TypeIDImE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDImE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDImE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (496|0);
}
function __ZN10emscripten8internal6TypeIDIlE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIlE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIlE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (488|0);
}
function __ZN10emscripten8internal6TypeIDIjE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIjE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIjE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (480|0);
}
function __ZN10emscripten8internal6TypeIDIiE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIiE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIiE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (472|0);
}
function __ZN10emscripten8internal6TypeIDItE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDItE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDItE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (464|0);
}
function __ZN10emscripten8internal6TypeIDIsE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIsE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIsE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (456|0);
}
function __ZN10emscripten8internal6TypeIDIhE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIhE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIhE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (440|0);
}
function __ZN10emscripten8internal6TypeIDIaE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIaE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIaE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (448|0);
}
function __ZN10emscripten8internal6TypeIDIcE3getEv() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10emscripten8internal11LightTypeIDIcE3getEv()|0);
 return ($call|0);
}
function __ZN10emscripten8internal11LightTypeIDIcE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (432|0);
}
function __ZN10emscripten8internal11LightTypeIDIbE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (424|0);
}
function __ZN10emscripten8internal11LightTypeIDIvE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (408|0);
}
function ___getTypeName($ti) {
 $ti = $ti|0;
 var $0 = 0, $__type_name$i = 0, $call1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $__type_name$i = ((($ti)) + 4|0);
 $0 = HEAP32[$__type_name$i>>2]|0;
 $call1 = (___strdup($0)|0);
 return ($call1|0);
}
function ___errno_location() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (2656|0);
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
   $0 = HEAP32[665]|0;
   $shr3 = $0 >>> $shr;
   $and4 = $shr3 & 3;
   $cmp5 = ($and4|0)==(0);
   if (!($cmp5)) {
    $neg = $shr3 & 1;
    $and7 = $neg ^ 1;
    $add8 = (($and7) + ($shr))|0;
    $shl = $add8 << 1;
    $arrayidx = (2700 + ($shl<<2)|0);
    $1 = ((($arrayidx)) + 8|0);
    $2 = HEAP32[$1>>2]|0;
    $fd9 = ((($2)) + 8|0);
    $3 = HEAP32[$fd9>>2]|0;
    $cmp10 = ($3|0)==($arrayidx|0);
    if ($cmp10) {
     $shl12 = 1 << $add8;
     $neg13 = $shl12 ^ -1;
     $and14 = $0 & $neg13;
     HEAP32[665] = $and14;
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
   $5 = HEAP32[(2668)>>2]|0;
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
     $arrayidx66 = (2700 + ($shl65<<2)|0);
     $6 = ((($arrayidx66)) + 8|0);
     $7 = HEAP32[$6>>2]|0;
     $fd69 = ((($7)) + 8|0);
     $8 = HEAP32[$fd69>>2]|0;
     $cmp70 = ($8|0)==($arrayidx66|0);
     if ($cmp70) {
      $shl72 = 1 << $add64;
      $neg73 = $shl72 ^ -1;
      $and74 = $0 & $neg73;
      HEAP32[665] = $and74;
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
      $9 = HEAP32[(2680)>>2]|0;
      $shr101 = $5 >>> 3;
      $shl102 = $shr101 << 1;
      $arrayidx103 = (2700 + ($shl102<<2)|0);
      $shl105 = 1 << $shr101;
      $and106 = $10 & $shl105;
      $tobool107 = ($and106|0)==(0);
      if ($tobool107) {
       $or110 = $10 | $shl105;
       HEAP32[665] = $or110;
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
     HEAP32[(2668)>>2] = $sub91;
     HEAP32[(2680)>>2] = $add$ptr95;
     $retval$0 = $fd69;
     STACKTOP = sp;return ($retval$0|0);
    }
    $13 = HEAP32[(2664)>>2]|0;
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
     $arrayidx$i = (2964 + ($add20$i<<2)|0);
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
        $arrayidx94$i = (2964 + ($26<<2)|0);
        $27 = HEAP32[$arrayidx94$i>>2]|0;
        $cmp95$i = ($v$0$i|0)==($27|0);
        if ($cmp95$i) {
         HEAP32[$arrayidx94$i>>2] = $R$3$i;
         $cond2$i = ($R$3$i|0)==(0|0);
         if ($cond2$i) {
          $shl$i = 1 << $26;
          $neg$i = $shl$i ^ -1;
          $and103$i = $13 & $neg$i;
          HEAP32[(2664)>>2] = $and103$i;
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
        $32 = HEAP32[(2680)>>2]|0;
        $shr194$i = $5 >>> 3;
        $shl195$i = $shr194$i << 1;
        $arrayidx196$i = (2700 + ($shl195$i<<2)|0);
        $shl198$i = 1 << $shr194$i;
        $and199$i = $shl198$i & $0;
        $tobool200$i = ($and199$i|0)==(0);
        if ($tobool200$i) {
         $or204$i = $shl198$i | $0;
         HEAP32[665] = $or204$i;
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
       HEAP32[(2668)>>2] = $rsize$0$i;
       HEAP32[(2680)>>2] = $add$ptr$i;
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
    $35 = HEAP32[(2664)>>2]|0;
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
     $arrayidx$i160 = (2964 + ($idx$0$i<<2)|0);
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
       $arrayidx94$i170 = (2964 + ($add92$i<<2)|0);
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
      $44 = HEAP32[(2668)>>2]|0;
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
          $arrayidx184$i = (2964 + ($52<<2)|0);
          $53 = HEAP32[$arrayidx184$i>>2]|0;
          $cmp185$i = ($v$4$lcssa$i|0)==($53|0);
          if ($cmp185$i) {
           HEAP32[$arrayidx184$i>>2] = $R$3$i188;
           $cond3$i = ($R$3$i188|0)==(0|0);
           if ($cond3$i) {
            $shl192$i = 1 << $52;
            $neg$i190 = $shl192$i ^ -1;
            $and194$i191 = $35 & $neg$i190;
            HEAP32[(2664)>>2] = $and194$i191;
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
           $arrayidx289$i = (2700 + ($shl288$i<<2)|0);
           $58 = HEAP32[665]|0;
           $shl291$i = 1 << $shr283$i;
           $and292$i = $58 & $shl291$i;
           $tobool293$i = ($and292$i|0)==(0);
           if ($tobool293$i) {
            $or297$i = $58 | $shl291$i;
            HEAP32[665] = $or297$i;
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
          $arrayidx355$i = (2964 + ($I316$0$i<<2)|0);
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
           HEAP32[(2664)>>2] = $or368$i;
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
 $67 = HEAP32[(2668)>>2]|0;
 $cmp156 = ($67>>>0)<($nb$0>>>0);
 if (!($cmp156)) {
  $sub160 = (($67) - ($nb$0))|0;
  $68 = HEAP32[(2680)>>2]|0;
  $cmp162 = ($sub160>>>0)>(15);
  if ($cmp162) {
   $add$ptr166 = (($68) + ($nb$0)|0);
   HEAP32[(2680)>>2] = $add$ptr166;
   HEAP32[(2668)>>2] = $sub160;
   $or167 = $sub160 | 1;
   $head168 = ((($add$ptr166)) + 4|0);
   HEAP32[$head168>>2] = $or167;
   $add$ptr169 = (($68) + ($67)|0);
   HEAP32[$add$ptr169>>2] = $sub160;
   $or172 = $nb$0 | 3;
   $head173 = ((($68)) + 4|0);
   HEAP32[$head173>>2] = $or172;
  } else {
   HEAP32[(2668)>>2] = 0;
   HEAP32[(2680)>>2] = 0;
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
 $70 = HEAP32[(2672)>>2]|0;
 $cmp186 = ($70>>>0)>($nb$0>>>0);
 if ($cmp186) {
  $sub190 = (($70) - ($nb$0))|0;
  HEAP32[(2672)>>2] = $sub190;
  $71 = HEAP32[(2684)>>2]|0;
  $add$ptr193 = (($71) + ($nb$0)|0);
  HEAP32[(2684)>>2] = $add$ptr193;
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
 $72 = HEAP32[783]|0;
 $cmp$i133 = ($72|0)==(0);
 if ($cmp$i133) {
  HEAP32[(3140)>>2] = 4096;
  HEAP32[(3136)>>2] = 4096;
  HEAP32[(3144)>>2] = -1;
  HEAP32[(3148)>>2] = -1;
  HEAP32[(3152)>>2] = 0;
  HEAP32[(3104)>>2] = 0;
  $73 = $magic$i$i;
  $xor$i$i = $73 & -16;
  $and6$i$i = $xor$i$i ^ 1431655768;
  HEAP32[783] = $and6$i$i;
  $74 = 4096;
 } else {
  $$pre$i134 = HEAP32[(3140)>>2]|0;
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
 $75 = HEAP32[(3100)>>2]|0;
 $cmp15$i = ($75|0)==(0);
 if (!($cmp15$i)) {
  $76 = HEAP32[(3092)>>2]|0;
  $add17$i = (($76) + ($and11$i))|0;
  $cmp19$i = ($add17$i>>>0)<=($76>>>0);
  $cmp21$i = ($add17$i>>>0)>($75>>>0);
  $or$cond1$i = $cmp19$i | $cmp21$i;
  if ($or$cond1$i) {
   $retval$0 = 0;
   STACKTOP = sp;return ($retval$0|0);
  }
 }
 $77 = HEAP32[(3104)>>2]|0;
 $and29$i = $77 & 4;
 $tobool30$i = ($and29$i|0)==(0);
 L178: do {
  if ($tobool30$i) {
   $78 = HEAP32[(2684)>>2]|0;
   $cmp32$i138 = ($78|0)==(0|0);
   L180: do {
    if ($cmp32$i138) {
     label = 128;
    } else {
     $sp$0$i$i = (3108);
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
      $call83$i = (_sbrk(($and80$i|0))|0);
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
      $83 = HEAP32[(3136)>>2]|0;
      $sub41$i = (($83) + -1)|0;
      $and42$i = $sub41$i & $82;
      $cmp43$i = ($and42$i|0)==(0);
      $add46$i = (($sub41$i) + ($82))|0;
      $neg48$i = (0 - ($83))|0;
      $and49$i = $add46$i & $neg48$i;
      $sub50$i = (($and49$i) - ($82))|0;
      $add51$i = $cmp43$i ? 0 : $sub50$i;
      $spec$select96$i = (($add51$i) + ($and11$i))|0;
      $84 = HEAP32[(3092)>>2]|0;
      $add54$i = (($spec$select96$i) + ($84))|0;
      $cmp55$i = ($spec$select96$i>>>0)>($nb$0>>>0);
      $cmp57$i = ($spec$select96$i>>>0)<(2147483647);
      $or$cond$i = $cmp55$i & $cmp57$i;
      if ($or$cond$i) {
       $85 = HEAP32[(3100)>>2]|0;
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
       $call68$i = (_sbrk(($spec$select96$i|0))|0);
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
     $88 = HEAP32[(3140)>>2]|0;
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
     $call107$i = (_sbrk(($and104$i|0))|0);
     $cmp108$i = ($call107$i|0)==((-1)|0);
     if ($cmp108$i) {
      (_sbrk(($sub112$i|0))|0);
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
   $89 = HEAP32[(3104)>>2]|0;
   $or$i = $89 | 4;
   HEAP32[(3104)>>2] = $or$i;
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
   $call131$i = (_sbrk(($and11$i|0))|0);
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
  $90 = HEAP32[(3092)>>2]|0;
  $add150$i = (($90) + ($tsize$794$i))|0;
  HEAP32[(3092)>>2] = $add150$i;
  $91 = HEAP32[(3096)>>2]|0;
  $cmp151$i = ($add150$i>>>0)>($91>>>0);
  if ($cmp151$i) {
   HEAP32[(3096)>>2] = $add150$i;
  }
  $92 = HEAP32[(2684)>>2]|0;
  $cmp157$i = ($92|0)==(0|0);
  L215: do {
   if ($cmp157$i) {
    $93 = HEAP32[(2676)>>2]|0;
    $cmp159$i = ($93|0)==(0|0);
    $cmp162$i = ($tbase$795$i>>>0)<($93>>>0);
    $or$cond11$i = $cmp159$i | $cmp162$i;
    if ($or$cond11$i) {
     HEAP32[(2676)>>2] = $tbase$795$i;
    }
    HEAP32[(3108)>>2] = $tbase$795$i;
    HEAP32[(3112)>>2] = $tsize$794$i;
    HEAP32[(3120)>>2] = 0;
    $94 = HEAP32[783]|0;
    HEAP32[(2696)>>2] = $94;
    HEAP32[(2692)>>2] = -1;
    HEAP32[(2712)>>2] = (2700);
    HEAP32[(2708)>>2] = (2700);
    HEAP32[(2720)>>2] = (2708);
    HEAP32[(2716)>>2] = (2708);
    HEAP32[(2728)>>2] = (2716);
    HEAP32[(2724)>>2] = (2716);
    HEAP32[(2736)>>2] = (2724);
    HEAP32[(2732)>>2] = (2724);
    HEAP32[(2744)>>2] = (2732);
    HEAP32[(2740)>>2] = (2732);
    HEAP32[(2752)>>2] = (2740);
    HEAP32[(2748)>>2] = (2740);
    HEAP32[(2760)>>2] = (2748);
    HEAP32[(2756)>>2] = (2748);
    HEAP32[(2768)>>2] = (2756);
    HEAP32[(2764)>>2] = (2756);
    HEAP32[(2776)>>2] = (2764);
    HEAP32[(2772)>>2] = (2764);
    HEAP32[(2784)>>2] = (2772);
    HEAP32[(2780)>>2] = (2772);
    HEAP32[(2792)>>2] = (2780);
    HEAP32[(2788)>>2] = (2780);
    HEAP32[(2800)>>2] = (2788);
    HEAP32[(2796)>>2] = (2788);
    HEAP32[(2808)>>2] = (2796);
    HEAP32[(2804)>>2] = (2796);
    HEAP32[(2816)>>2] = (2804);
    HEAP32[(2812)>>2] = (2804);
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
    HEAP32[(2684)>>2] = $add$ptr4$i49$i;
    HEAP32[(2672)>>2] = $sub5$i50$i;
    $or$i51$i = $sub5$i50$i | 1;
    $head$i52$i = ((($add$ptr4$i49$i)) + 4|0);
    HEAP32[$head$i52$i>>2] = $or$i51$i;
    $add$ptr6$i53$i = (($tbase$795$i) + ($sub172$i)|0);
    $head7$i54$i = ((($add$ptr6$i53$i)) + 4|0);
    HEAP32[$head7$i54$i>>2] = 40;
    $96 = HEAP32[(3148)>>2]|0;
    HEAP32[(2688)>>2] = $96;
   } else {
    $sp$0112$i = (3108);
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
       $101 = HEAP32[(2672)>>2]|0;
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
       HEAP32[(2684)>>2] = $add$ptr4$i41$i;
       HEAP32[(2672)>>2] = $sub5$i$i;
       $or$i$i = $sub5$i$i | 1;
       $head$i42$i = ((($add$ptr4$i41$i)) + 4|0);
       HEAP32[$head$i42$i>>2] = $or$i$i;
       $add$ptr6$i$i = (($92) + ($add215$i)|0);
       $head7$i$i = ((($add$ptr6$i$i)) + 4|0);
       HEAP32[$head7$i$i>>2] = 40;
       $103 = HEAP32[(3148)>>2]|0;
       HEAP32[(2688)>>2] = $103;
       break;
      }
     }
    }
    $104 = HEAP32[(2676)>>2]|0;
    $cmp218$i = ($tbase$795$i>>>0)<($104>>>0);
    if ($cmp218$i) {
     HEAP32[(2676)>>2] = $tbase$795$i;
    }
    $add$ptr227$i = (($tbase$795$i) + ($tsize$794$i)|0);
    $sp$1111$i = (3108);
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
        $111 = HEAP32[(2672)>>2]|0;
        $add$i$i = (($111) + ($sub18$i$i))|0;
        HEAP32[(2672)>>2] = $add$i$i;
        HEAP32[(2684)>>2] = $add$ptr17$i$i;
        $or22$i$i = $add$i$i | 1;
        $head23$i$i = ((($add$ptr17$i$i)) + 4|0);
        HEAP32[$head23$i$i>>2] = $or22$i$i;
       } else {
        $112 = HEAP32[(2680)>>2]|0;
        $cmp24$i$i = ($112|0)==($add$ptr16$i$i|0);
        if ($cmp24$i$i) {
         $113 = HEAP32[(2668)>>2]|0;
         $add26$i$i = (($113) + ($sub18$i$i))|0;
         HEAP32[(2668)>>2] = $add26$i$i;
         HEAP32[(2680)>>2] = $add$ptr17$i$i;
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
            $117 = HEAP32[665]|0;
            $and49$i$i = $117 & $neg$i$i;
            HEAP32[665] = $and49$i$i;
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
           $arrayidx123$i$i = (2964 + ($125<<2)|0);
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
             $127 = HEAP32[(2664)>>2]|0;
             $and133$i$i = $127 & $neg132$i$i;
             HEAP32[(2664)>>2] = $and133$i$i;
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
         $arrayidx223$i$i = (2700 + ($shl222$i$i<<2)|0);
         $132 = HEAP32[665]|0;
         $shl226$i$i = 1 << $shr214$i$i;
         $and227$i$i = $132 & $shl226$i$i;
         $tobool228$i$i = ($and227$i$i|0)==(0);
         if ($tobool228$i$i) {
          $or232$i$i = $132 | $shl226$i$i;
          HEAP32[665] = $or232$i$i;
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
        $arrayidx287$i$i = (2964 + ($I252$0$i$i<<2)|0);
        $index288$i$i = ((($add$ptr17$i$i)) + 28|0);
        HEAP32[$index288$i$i>>2] = $I252$0$i$i;
        $child289$i$i = ((($add$ptr17$i$i)) + 16|0);
        $arrayidx290$i$i = ((($child289$i$i)) + 4|0);
        HEAP32[$arrayidx290$i$i>>2] = 0;
        HEAP32[$child289$i$i>>2] = 0;
        $135 = HEAP32[(2664)>>2]|0;
        $shl294$i$i = 1 << $I252$0$i$i;
        $and295$i$i = $135 & $shl294$i$i;
        $tobool296$i$i = ($and295$i$i|0)==(0);
        if ($tobool296$i$i) {
         $or300$i$i = $135 | $shl294$i$i;
         HEAP32[(2664)>>2] = $or300$i$i;
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
    $sp$0$i$i$i = (3108);
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
    HEAP32[(2684)>>2] = $add$ptr4$i$i$i;
    HEAP32[(2672)>>2] = $sub5$i$i$i;
    $or$i$i$i = $sub5$i$i$i | 1;
    $head$i$i$i = ((($add$ptr4$i$i$i)) + 4|0);
    HEAP32[$head$i$i$i>>2] = $or$i$i$i;
    $add$ptr6$i$i$i = (($tbase$795$i) + ($sub16$i$i)|0);
    $head7$i$i$i = ((($add$ptr6$i$i$i)) + 4|0);
    HEAP32[$head7$i$i$i>>2] = 40;
    $146 = HEAP32[(3148)>>2]|0;
    HEAP32[(2688)>>2] = $146;
    $head$i$i = ((($cond13$i$i)) + 4|0);
    HEAP32[$head$i$i>>2] = 27;
    ;HEAP32[$add$ptr14$i$i>>2]=HEAP32[(3108)>>2]|0;HEAP32[$add$ptr14$i$i+4>>2]=HEAP32[(3108)+4>>2]|0;HEAP32[$add$ptr14$i$i+8>>2]=HEAP32[(3108)+8>>2]|0;HEAP32[$add$ptr14$i$i+12>>2]=HEAP32[(3108)+12>>2]|0;
    HEAP32[(3108)>>2] = $tbase$795$i;
    HEAP32[(3112)>>2] = $tsize$794$i;
    HEAP32[(3120)>>2] = 0;
    HEAP32[(3116)>>2] = $add$ptr14$i$i;
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
      $arrayidx$i$i = (2700 + ($shl$i$i<<2)|0);
      $149 = HEAP32[665]|0;
      $shl39$i$i = 1 << $shr$i$i;
      $and40$i$i = $149 & $shl39$i$i;
      $tobool$i$i = ($and40$i$i|0)==(0);
      if ($tobool$i$i) {
       $or44$i$i = $149 | $shl39$i$i;
       HEAP32[665] = $or44$i$i;
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
     $arrayidx91$i$i = (2964 + ($I57$0$i$i<<2)|0);
     $index$i$i = ((($92)) + 28|0);
     HEAP32[$index$i$i>>2] = $I57$0$i$i;
     $arrayidx92$i$i = ((($92)) + 20|0);
     HEAP32[$arrayidx92$i$i>>2] = 0;
     HEAP32[$add$ptr81$i$i>>2] = 0;
     $152 = HEAP32[(2664)>>2]|0;
     $shl95$i$i = 1 << $I57$0$i$i;
     $and96$i$i = $152 & $shl95$i$i;
     $tobool97$i$i = ($and96$i$i|0)==(0);
     if ($tobool97$i$i) {
      $or101$i$i = $152 | $shl95$i$i;
      HEAP32[(2664)>>2] = $or101$i$i;
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
  $158 = HEAP32[(2672)>>2]|0;
  $cmp257$i = ($158>>>0)>($nb$0>>>0);
  if ($cmp257$i) {
   $sub260$i = (($158) - ($nb$0))|0;
   HEAP32[(2672)>>2] = $sub260$i;
   $159 = HEAP32[(2684)>>2]|0;
   $add$ptr262$i = (($159) + ($nb$0)|0);
   HEAP32[(2684)>>2] = $add$ptr262$i;
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
 HEAP32[$call275$i>>2] = 12;
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
 $0 = HEAP32[(2676)>>2]|0;
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
   $3 = HEAP32[(2680)>>2]|0;
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
    HEAP32[(2668)>>2] = $add17;
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
     $6 = HEAP32[665]|0;
     $and46 = $6 & $neg;
     HEAP32[665] = $and46;
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
    $arrayidx130 = (2964 + ($14<<2)|0);
    $15 = HEAP32[$arrayidx130>>2]|0;
    $cmp131 = ($15|0)==($add$ptr16|0);
    if ($cmp131) {
     HEAP32[$arrayidx130>>2] = $R$3;
     $cond254 = ($R$3|0)==(0|0);
     if ($cond254) {
      $shl138 = 1 << $14;
      $neg139 = $shl138 ^ -1;
      $16 = HEAP32[(2664)>>2]|0;
      $and140 = $16 & $neg139;
      HEAP32[(2664)>>2] = $and140;
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
  $23 = HEAP32[(2684)>>2]|0;
  $cmp243 = ($23|0)==($add$ptr6|0);
  if ($cmp243) {
   $24 = HEAP32[(2672)>>2]|0;
   $add246 = (($24) + ($psize$1))|0;
   HEAP32[(2672)>>2] = $add246;
   HEAP32[(2684)>>2] = $p$1;
   $or247 = $add246 | 1;
   $head248 = ((($p$1)) + 4|0);
   HEAP32[$head248>>2] = $or247;
   $25 = HEAP32[(2680)>>2]|0;
   $cmp249 = ($p$1|0)==($25|0);
   if (!($cmp249)) {
    return;
   }
   HEAP32[(2680)>>2] = 0;
   HEAP32[(2668)>>2] = 0;
   return;
  }
  $26 = HEAP32[(2680)>>2]|0;
  $cmp255 = ($26|0)==($add$ptr6|0);
  if ($cmp255) {
   $27 = HEAP32[(2668)>>2]|0;
   $add258 = (($27) + ($psize$1))|0;
   HEAP32[(2668)>>2] = $add258;
   HEAP32[(2680)>>2] = $21;
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
     $30 = HEAP32[665]|0;
     $and301 = $30 & $neg300;
     HEAP32[665] = $and301;
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
     $arrayidx400 = (2964 + ($38<<2)|0);
     $39 = HEAP32[$arrayidx400>>2]|0;
     $cmp401 = ($39|0)==($add$ptr6|0);
     if ($cmp401) {
      HEAP32[$arrayidx400>>2] = $R332$3;
      $cond255 = ($R332$3|0)==(0|0);
      if ($cond255) {
       $shl408 = 1 << $38;
       $neg409 = $shl408 ^ -1;
       $40 = HEAP32[(2664)>>2]|0;
       $and410 = $40 & $neg409;
       HEAP32[(2664)>>2] = $and410;
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
  $44 = HEAP32[(2680)>>2]|0;
  $cmp484 = ($p$1|0)==($44|0);
  if ($cmp484) {
   HEAP32[(2668)>>2] = $add267;
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
  $arrayidx509 = (2700 + ($shl508<<2)|0);
  $45 = HEAP32[665]|0;
  $shl511 = 1 << $shr501;
  $and512 = $45 & $shl511;
  $tobool513 = ($and512|0)==(0);
  if ($tobool513) {
   $or516 = $45 | $shl511;
   HEAP32[665] = $or516;
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
 $arrayidx567 = (2964 + ($I534$0<<2)|0);
 $index568 = ((($p$1)) + 28|0);
 HEAP32[$index568>>2] = $I534$0;
 $child569 = ((($p$1)) + 16|0);
 $arrayidx570 = ((($p$1)) + 20|0);
 HEAP32[$arrayidx570>>2] = 0;
 HEAP32[$child569>>2] = 0;
 $48 = HEAP32[(2664)>>2]|0;
 $shl573 = 1 << $I534$0;
 $and574 = $48 & $shl573;
 $tobool575 = ($and574|0)==(0);
 L112: do {
  if ($tobool575) {
   $or578 = $48 | $shl573;
   HEAP32[(2664)>>2] = $or578;
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
 $54 = HEAP32[(2692)>>2]|0;
 $dec = (($54) + -1)|0;
 HEAP32[(2692)>>2] = $dec;
 $cmp640 = ($dec|0)==(0);
 if (!($cmp640)) {
  return;
 }
 $sp$0$in$i = (3116);
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
 HEAP32[(2692)>>2] = -1;
 return;
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
function __ZdlPv($ptr) {
 $ptr = $ptr|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($ptr);
 return;
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
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $call = 0, $cmp = 0, $cmp4 = 0, $dst_ptr_leading_to_static_ptr = 0, $info = 0, $number_of_dst_type = 0, $path_dst_ptr_to_static_ptr = 0, $retval$0 = 0, $retval$2 = 0, $src2dst_offset = 0, $static_type = 0, $vfn = 0, $vtable = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $info = sp;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$thrown_type,0)|0);
 if ($call) {
  $retval$2 = 1;
 } else {
  $0 = ($thrown_type|0)==(0|0);
  if ($0) {
   $retval$2 = 0;
  } else {
   $1 = (___dynamic_cast($thrown_type,320,304,0)|0);
   $cmp = ($1|0)==(0|0);
   if ($cmp) {
    $retval$2 = 0;
   } else {
    $2 = ((($info)) + 4|0);
    dest=$2; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
    HEAP32[$info>>2] = $1;
    $static_type = ((($info)) + 8|0);
    HEAP32[$static_type>>2] = $this;
    $src2dst_offset = ((($info)) + 12|0);
    HEAP32[$src2dst_offset>>2] = -1;
    $number_of_dst_type = ((($info)) + 48|0);
    HEAP32[$number_of_dst_type>>2] = 1;
    $vtable = HEAP32[$1>>2]|0;
    $vfn = ((($vtable)) + 28|0);
    $3 = HEAP32[$vfn>>2]|0;
    $4 = HEAP32[$adjustedPtr>>2]|0;
    FUNCTION_TABLE_viiii[$3 & 7]($1,$info,$4,1);
    $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
    $5 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
    $cmp4 = ($5|0)==(1);
    if ($cmp4) {
     $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
     $6 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
     HEAP32[$adjustedPtr>>2] = $6;
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
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
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
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
 do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$info,$current_ptr,$path_below);
  } else {
   $1 = HEAP32[$info>>2]|0;
   $call3 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$1,$use_strcmp)|0);
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
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,0)|0);
 if ($call) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$info,$adjustedPtr,$path_below);
 }
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($x,$y,$0) {
 $x = $x|0;
 $y = $y|0;
 $0 = $0|0;
 var $cmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($x|0)==($y|0);
 return ($cmp|0);
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
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($2,$dst_type,0)|0);
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
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
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
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__base_type = 0, $__base_type40 = 0, $add = 0, $call = 0, $call3 = 0;
 var $cmp = 0, $cmp11 = 0, $cmp26 = 0, $cmp27 = 0, $cmp5 = 0, $cmp7 = 0, $dst_ptr_leading_to_static_ptr = 0, $dst_ptr_not_leading_to_static_ptr = 0, $found_any_static_type = 0, $found_our_static_ptr = 0, $is_dst_type_derived_from_static_type = 0, $is_dst_type_derived_from_static_type13$0$off032 = 0, $number_to_dst_ptr = 0, $number_to_static_ptr = 0, $path_dst_ptr_to_static_ptr = 0, $path_dynamic_ptr_to_dst_ptr = 0, $path_dynamic_ptr_to_dst_ptr10 = 0, $search_done = 0, $static_type = 0, $tobool16 = 0;
 var $tobool19 = 0, $vfn = 0, $vfn42 = 0, $vtable = 0, $vtable41 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
 do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$info,$current_ptr,$path_below);
  } else {
   $1 = HEAP32[$info>>2]|0;
   $call3 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$1,$use_strcmp)|0);
   if (!($call3)) {
    $__base_type40 = ((($this)) + 8|0);
    $13 = HEAP32[$__base_type40>>2]|0;
    $vtable41 = HEAP32[$13>>2]|0;
    $vfn42 = ((($vtable41)) + 24|0);
    $14 = HEAP32[$vfn42>>2]|0;
    FUNCTION_TABLE_viiiii[$14 & 3]($13,$info,$current_ptr,$path_below,$use_strcmp);
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
     if ($cmp11) {
      break;
     }
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
      $is_dst_type_derived_from_static_type13$0$off032 = 0;
      label = 11;
     } else {
      $8 = HEAP8[$found_our_static_ptr>>0]|0;
      $tobool19 = ($8<<24>>24)==(0);
      if ($tobool19) {
       $is_dst_type_derived_from_static_type13$0$off032 = 1;
       label = 11;
      } else {
       label = 15;
      }
     }
     do {
      if ((label|0) == 11) {
       HEAP32[$dst_ptr_not_leading_to_static_ptr>>2] = $current_ptr;
       $number_to_dst_ptr = ((($info)) + 40|0);
       $9 = HEAP32[$number_to_dst_ptr>>2]|0;
       $add = (($9) + 1)|0;
       HEAP32[$number_to_dst_ptr>>2] = $add;
       $number_to_static_ptr = ((($info)) + 36|0);
       $10 = HEAP32[$number_to_static_ptr>>2]|0;
       $cmp26 = ($10|0)==(1);
       if ($cmp26) {
        $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
        $11 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
        $cmp27 = ($11|0)==(2);
        if ($cmp27) {
         $search_done = ((($info)) + 54|0);
         HEAP8[$search_done>>0] = 1;
         if ($is_dst_type_derived_from_static_type13$0$off032) {
          label = 15;
          break;
         } else {
          $12 = 4;
          break;
         }
        }
       }
       if ($is_dst_type_derived_from_static_type13$0$off032) {
        label = 15;
       } else {
        $12 = 4;
       }
      }
     } while(0);
     if ((label|0) == 15) {
      $12 = 3;
     }
     HEAP32[$is_dst_type_derived_from_static_type>>2] = $12;
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
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,0)|0);
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
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$thrown_type,0)|0);
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
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var $__flags = 0, $__flags4 = 0, $__pointee = 0, $__pointee7 = 0, $and = 0, $call = 0, $call12 = 0, $call8 = 0, $cmp = 0, $cmp19 = 0, $cmp26 = 0, $cmp29 = 0, $dst_ptr_leading_to_static_ptr = 0, $info = 0, $neg = 0, $number_of_dst_type = 0, $path_dst_ptr_to_static_ptr = 0, $retval$0 = 0, $retval$4 = 0, $src2dst_offset = 0;
 var $static_type = 0, $tobool = 0, $vfn = 0, $vtable = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0;
 $info = sp;
 $0 = HEAP32[$adjustedPtr>>2]|0;
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$adjustedPtr>>2] = $1;
 $call = (__ZNK10__cxxabiv117__pbase_type_info9can_catchEPKNS_16__shim_type_infoERPv($this,$thrown_type,0)|0);
 if ($call) {
  $retval$4 = 1;
 } else {
  $2 = ($thrown_type|0)==(0|0);
  if ($2) {
   $retval$4 = 0;
  } else {
   $3 = (___dynamic_cast($thrown_type,320,376,0)|0);
   $cmp = ($3|0)==(0|0);
   if ($cmp) {
    $retval$4 = 0;
   } else {
    $__flags = ((($3)) + 8|0);
    $4 = HEAP32[$__flags>>2]|0;
    $__flags4 = ((($this)) + 8|0);
    $5 = HEAP32[$__flags4>>2]|0;
    $neg = $5 ^ -1;
    $and = $4 & $neg;
    $tobool = ($and|0)==(0);
    if ($tobool) {
     $__pointee = ((($this)) + 12|0);
     $6 = HEAP32[$__pointee>>2]|0;
     $__pointee7 = ((($3)) + 12|0);
     $7 = HEAP32[$__pointee7>>2]|0;
     $call8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($6,$7,0)|0);
     if ($call8) {
      $retval$4 = 1;
     } else {
      $8 = HEAP32[$__pointee>>2]|0;
      $call12 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($8,408,0)|0);
      if ($call12) {
       $retval$4 = 1;
      } else {
       $9 = HEAP32[$__pointee>>2]|0;
       $10 = ($9|0)==(0|0);
       if ($10) {
        $retval$4 = 0;
       } else {
        $11 = (___dynamic_cast($9,320,304,0)|0);
        $cmp19 = ($11|0)==(0|0);
        if ($cmp19) {
         $retval$4 = 0;
        } else {
         $12 = HEAP32[$__pointee7>>2]|0;
         $13 = ($12|0)==(0|0);
         if ($13) {
          $retval$4 = 0;
         } else {
          $14 = (___dynamic_cast($12,320,304,0)|0);
          $cmp26 = ($14|0)==(0|0);
          if ($cmp26) {
           $retval$4 = 0;
          } else {
           $15 = ((($info)) + 4|0);
           dest=$15; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
           HEAP32[$info>>2] = $14;
           $static_type = ((($info)) + 8|0);
           HEAP32[$static_type>>2] = $11;
           $src2dst_offset = ((($info)) + 12|0);
           HEAP32[$src2dst_offset>>2] = -1;
           $number_of_dst_type = ((($info)) + 48|0);
           HEAP32[$number_of_dst_type>>2] = 1;
           $vtable = HEAP32[$14>>2]|0;
           $vfn = ((($vtable)) + 28|0);
           $16 = HEAP32[$vfn>>2]|0;
           $17 = HEAP32[$adjustedPtr>>2]|0;
           FUNCTION_TABLE_viiii[$16 & 7]($14,$info,$17,1);
           $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
           $18 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
           $cmp29 = ($18|0)==(1);
           if ($cmp29) {
            $dst_ptr_leading_to_static_ptr = ((($info)) + 16|0);
            $19 = HEAP32[$dst_ptr_leading_to_static_ptr>>2]|0;
            HEAP32[$adjustedPtr>>2] = $19;
            $retval$0 = 1;
           } else {
            $retval$0 = 0;
           }
           $retval$4 = $retval$0;
          }
         }
        }
       }
      }
     }
    } else {
     $retval$4 = 0;
    }
   }
  }
 }
 STACKTOP = sp;return ($retval$4|0);
}
function __ZNK10__cxxabiv117__pbase_type_info9can_catchEPKNS_16__shim_type_infoERPv($this,$thrown_type,$0) {
 $this = $this|0;
 $thrown_type = $thrown_type|0;
 $0 = $0|0;
 var $call = 0, $call2 = 0, $retval$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$thrown_type,0)|0);
 if ($call) {
  $retval$0 = 1;
 } else {
  $call2 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($thrown_type,416,0)|0);
  $retval$0 = $call2;
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
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__base_count = 0, $__flags = 0, $add$ptr = 0, $and = 0, $and30 = 0, $arraydecay = 0, $call = 0, $cmp = 0, $cmp19 = 0, $cmp40 = 0;
 var $found_any_static_type5 = 0, $found_our_static_ptr2 = 0, $incdec$ptr = 0, $incdec$ptr39 = 0, $p$0 = 0, $path_dst_ptr_to_static_ptr = 0, $search_done = 0, $static_type = 0, $tobool14 = 0, $tobool17 = 0, $tobool22 = 0, $tobool27 = 0, $tobool31 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
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
  $cmp = ($3|0)>(1);
  L4: do {
   if ($cmp) {
    $incdec$ptr = ((($this)) + 24|0);
    $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
    $__flags = ((($this)) + 8|0);
    $search_done = ((($info)) + 54|0);
    $p$0 = $incdec$ptr;
    while(1) {
     $4 = HEAP8[$search_done>>0]|0;
     $tobool14 = ($4<<24>>24)==(0);
     if (!($tobool14)) {
      break L4;
     }
     $5 = HEAP8[$found_our_static_ptr2>>0]|0;
     $tobool17 = ($5<<24>>24)==(0);
     if ($tobool17) {
      $8 = HEAP8[$found_any_static_type5>>0]|0;
      $tobool27 = ($8<<24>>24)==(0);
      if (!($tobool27)) {
       $9 = HEAP32[$__flags>>2]|0;
       $and30 = $9 & 1;
       $tobool31 = ($and30|0)==(0);
       if ($tobool31) {
        break L4;
       }
      }
     } else {
      $6 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
      $cmp19 = ($6|0)==(1);
      if ($cmp19) {
       break L4;
      }
      $7 = HEAP32[$__flags>>2]|0;
      $and = $7 & 2;
      $tobool22 = ($and|0)==(0);
      if ($tobool22) {
       break L4;
      }
     }
     HEAP8[$found_our_static_ptr2>>0] = 0;
     HEAP8[$found_any_static_type5>>0] = 0;
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($p$0,$info,$dst_ptr,$current_ptr,$path_below,$use_strcmp);
     $incdec$ptr39 = ((($p$0)) + 8|0);
     $cmp40 = ($incdec$ptr39>>>0)<($add$ptr>>>0);
     if ($cmp40) {
      $p$0 = $incdec$ptr39;
     } else {
      break;
     }
    }
   }
  } while(0);
  HEAP8[$found_our_static_ptr2>>0] = $1;
  HEAP8[$found_any_static_type5>>0] = $2;
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($this,$info,$current_ptr,$path_below,$use_strcmp) {
 $this = $this|0;
 $info = $info|0;
 $current_ptr = $current_ptr|0;
 $path_below = $path_below|0;
 $use_strcmp = $use_strcmp|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $__base_count = 0, $__base_count63 = 0, $__flags34 = 0, $__flags72 = 0, $add = 0, $add$ptr = 0, $add$ptr64 = 0, $and = 0, $and35 = 0, $and73 = 0, $and88 = 0, $arraydecay = 0, $arraydecay62 = 0, $call = 0, $call3 = 0;
 var $cmp = 0, $cmp100 = 0, $cmp106 = 0, $cmp11 = 0, $cmp115 = 0, $cmp121 = 0, $cmp16 = 0, $cmp27 = 0, $cmp44 = 0, $cmp46 = 0, $cmp5 = 0, $cmp7 = 0, $cmp70 = 0, $cmp77 = 0, $cmp85 = 0, $cmp97 = 0, $does_dst_type_point_to_our_static_type$0$off0 = 0, $does_dst_type_point_to_our_static_type$1$off0 = 0, $dst_ptr_leading_to_static_ptr = 0, $dst_ptr_not_leading_to_static_ptr = 0;
 var $found_any_static_type = 0, $found_our_static_ptr = 0, $incdec$ptr = 0, $incdec$ptr105 = 0, $incdec$ptr120 = 0, $incdec$ptr69 = 0, $incdec$ptr84 = 0, $is_dst_type_derived_from_static_type = 0, $is_dst_type_derived_from_static_type13$0$off0 = 0, $is_dst_type_derived_from_static_type13$1$off0 = 0, $is_dst_type_derived_from_static_type13$2$off0 = 0, $number_to_dst_ptr = 0, $number_to_static_ptr = 0, $number_to_static_ptr76 = 0, $p$0 = 0, $p65$0 = 0, $p65$1 = 0, $p65$2 = 0, $path_dst_ptr_to_static_ptr = 0, $path_dst_ptr_to_static_ptr99 = 0;
 var $path_dynamic_ptr_to_dst_ptr = 0, $path_dynamic_ptr_to_dst_ptr10 = 0, $search_done = 0, $search_done110 = 0, $search_done79 = 0, $search_done92 = 0, $static_type = 0, $tobool111 = 0, $tobool18 = 0, $tobool22 = 0, $tobool25 = 0, $tobool30 = 0, $tobool36 = 0, $tobool74 = 0, $tobool80 = 0, $tobool89 = 0, $tobool93 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $static_type = ((($info)) + 8|0);
 $0 = HEAP32[$static_type>>2]|0;
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,$use_strcmp)|0);
 L1: do {
  if ($call) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$info,$current_ptr,$path_below);
  } else {
   $1 = HEAP32[$info>>2]|0;
   $call3 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$1,$use_strcmp)|0);
   if (!($call3)) {
    $arraydecay62 = ((($this)) + 16|0);
    $__base_count63 = ((($this)) + 12|0);
    $16 = HEAP32[$__base_count63>>2]|0;
    $add$ptr64 = (((($this)) + 16|0) + ($16<<3)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($arraydecay62,$info,$current_ptr,$path_below,$use_strcmp);
    $incdec$ptr69 = ((($this)) + 24|0);
    $cmp70 = ($16|0)>(1);
    if (!($cmp70)) {
     break;
    }
    $__flags72 = ((($this)) + 8|0);
    $17 = HEAP32[$__flags72>>2]|0;
    $and73 = $17 & 2;
    $tobool74 = ($and73|0)==(0);
    if ($tobool74) {
     $number_to_static_ptr76 = ((($info)) + 36|0);
     $18 = HEAP32[$number_to_static_ptr76>>2]|0;
     $cmp77 = ($18|0)==(1);
     if (!($cmp77)) {
      $and88 = $17 & 1;
      $tobool89 = ($and88|0)==(0);
      if ($tobool89) {
       $search_done110 = ((($info)) + 54|0);
       $p65$2 = $incdec$ptr69;
       while(1) {
        $23 = HEAP8[$search_done110>>0]|0;
        $tobool111 = ($23<<24>>24)==(0);
        if (!($tobool111)) {
         break L1;
        }
        $24 = HEAP32[$number_to_static_ptr76>>2]|0;
        $cmp115 = ($24|0)==(1);
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
       $20 = HEAP8[$search_done92>>0]|0;
       $tobool93 = ($20<<24>>24)==(0);
       if (!($tobool93)) {
        break L1;
       }
       $21 = HEAP32[$number_to_static_ptr76>>2]|0;
       $cmp97 = ($21|0)==(1);
       if ($cmp97) {
        $22 = HEAP32[$path_dst_ptr_to_static_ptr99>>2]|0;
        $cmp100 = ($22|0)==(1);
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
     $19 = HEAP8[$search_done79>>0]|0;
     $tobool80 = ($19<<24>>24)==(0);
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
     if ($cmp11) {
      break;
     }
     $arraydecay = ((($this)) + 16|0);
     $__base_count = ((($this)) + 12|0);
     $5 = HEAP32[$__base_count>>2]|0;
     $add$ptr = (((($this)) + 16|0) + ($5<<3)|0);
     $found_our_static_ptr = ((($info)) + 52|0);
     $found_any_static_type = ((($info)) + 53|0);
     $search_done = ((($info)) + 54|0);
     $__flags34 = ((($this)) + 8|0);
     $path_dst_ptr_to_static_ptr = ((($info)) + 24|0);
     $does_dst_type_point_to_our_static_type$0$off0 = 0;$is_dst_type_derived_from_static_type13$0$off0 = 0;$p$0 = $arraydecay;
     L32: while(1) {
      $cmp16 = ($p$0>>>0)<($add$ptr>>>0);
      if (!($cmp16)) {
       $is_dst_type_derived_from_static_type13$2$off0 = $is_dst_type_derived_from_static_type13$0$off0;
       label = 18;
       break;
      }
      HEAP8[$found_our_static_ptr>>0] = 0;
      HEAP8[$found_any_static_type>>0] = 0;
      __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($p$0,$info,$current_ptr,$current_ptr,1,$use_strcmp);
      $6 = HEAP8[$search_done>>0]|0;
      $tobool18 = ($6<<24>>24)==(0);
      if (!($tobool18)) {
       $is_dst_type_derived_from_static_type13$2$off0 = $is_dst_type_derived_from_static_type13$0$off0;
       label = 18;
       break;
      }
      $7 = HEAP8[$found_any_static_type>>0]|0;
      $tobool22 = ($7<<24>>24)==(0);
      do {
       if ($tobool22) {
        $does_dst_type_point_to_our_static_type$1$off0 = $does_dst_type_point_to_our_static_type$0$off0;$is_dst_type_derived_from_static_type13$1$off0 = $is_dst_type_derived_from_static_type13$0$off0;
       } else {
        $8 = HEAP8[$found_our_static_ptr>>0]|0;
        $tobool25 = ($8<<24>>24)==(0);
        if ($tobool25) {
         $11 = HEAP32[$__flags34>>2]|0;
         $and35 = $11 & 1;
         $tobool36 = ($and35|0)==(0);
         if ($tobool36) {
          $is_dst_type_derived_from_static_type13$2$off0 = 1;
          label = 18;
          break L32;
         } else {
          $does_dst_type_point_to_our_static_type$1$off0 = $does_dst_type_point_to_our_static_type$0$off0;$is_dst_type_derived_from_static_type13$1$off0 = 1;
          break;
         }
        }
        $9 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
        $cmp27 = ($9|0)==(1);
        if ($cmp27) {
         label = 23;
         break L32;
        }
        $10 = HEAP32[$__flags34>>2]|0;
        $and = $10 & 2;
        $tobool30 = ($and|0)==(0);
        if ($tobool30) {
         label = 23;
         break L32;
        } else {
         $does_dst_type_point_to_our_static_type$1$off0 = 1;$is_dst_type_derived_from_static_type13$1$off0 = 1;
        }
       }
      } while(0);
      $incdec$ptr = ((($p$0)) + 8|0);
      $does_dst_type_point_to_our_static_type$0$off0 = $does_dst_type_point_to_our_static_type$1$off0;$is_dst_type_derived_from_static_type13$0$off0 = $is_dst_type_derived_from_static_type13$1$off0;$p$0 = $incdec$ptr;
     }
     do {
      if ((label|0) == 18) {
       if (!($does_dst_type_point_to_our_static_type$0$off0)) {
        HEAP32[$dst_ptr_not_leading_to_static_ptr>>2] = $current_ptr;
        $number_to_dst_ptr = ((($info)) + 40|0);
        $12 = HEAP32[$number_to_dst_ptr>>2]|0;
        $add = (($12) + 1)|0;
        HEAP32[$number_to_dst_ptr>>2] = $add;
        $number_to_static_ptr = ((($info)) + 36|0);
        $13 = HEAP32[$number_to_static_ptr>>2]|0;
        $cmp44 = ($13|0)==(1);
        if ($cmp44) {
         $14 = HEAP32[$path_dst_ptr_to_static_ptr>>2]|0;
         $cmp46 = ($14|0)==(2);
         if ($cmp46) {
          HEAP8[$search_done>>0] = 1;
          if ($is_dst_type_derived_from_static_type13$2$off0) {
           label = 23;
           break;
          } else {
           $15 = 4;
           break;
          }
         }
        }
       }
       if ($is_dst_type_derived_from_static_type13$2$off0) {
        label = 23;
       } else {
        $15 = 4;
       }
      }
     } while(0);
     if ((label|0) == 23) {
      $15 = 3;
     }
     HEAP32[$is_dst_type_derived_from_static_type>>2] = $15;
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
 $call = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($this,$0,0)|0);
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
  $1 = HEAP32[$adjustedPtr>>2]|0;
  $add$ptr = (($1) + ($shr)|0);
  $2 = HEAP32[$add$ptr>>2]|0;
  $offset_to_base$0 = $2;
 }
 $3 = HEAP32[$this>>2]|0;
 $vtable3 = HEAP32[$3>>2]|0;
 $vfn = ((($vtable3)) + 28|0);
 $4 = HEAP32[$vfn>>2]|0;
 $add$ptr4 = (($adjustedPtr) + ($offset_to_base$0)|0);
 $and6 = $0 & 2;
 $tobool7 = ($and6|0)==(0);
 $cond = $tobool7 ? 2 : $path_below;
 FUNCTION_TABLE_viiii[$4 & 7]($3,$info,$add$ptr4,$cond);
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
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[789]|0;
 $1 = (($0) + 0)|0;
 HEAP32[789] = $1;
 $2 = $0;
 return ($2|0);
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
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    totalMemory = _emscripten_get_heap_size()|0;

      oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
      newDynamicTop = oldDynamicTop + increment | 0;

      if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
        | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
        abortOnCannotGrowMemory(newDynamicTop|0)|0;
        ___setErrNo(12);
        return -1;
      }

      if ((newDynamicTop|0) > (totalMemory|0)) {
        if (_emscripten_resize_heap(newDynamicTop|0)|0) {
          // We resized the heap. Start another loop iteration if we need to.
        } else {
          // We failed to resize the heap.
          ___setErrNo(12);
          return -1;
        }
      }

      HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop|0;

    return oldDynamicTop|0;
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
  return FUNCTION_TABLE_iii[index&3](a1|0,a2|0)|0;
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
var FUNCTION_TABLE_iii = [b2,__Z12peek_state_rRK6QStatei,__ZN10emscripten8internal7InvokerI6QStateJRKS2_EE6invokeEPFS2_S4_EPS2_,b2];
var FUNCTION_TABLE_iiii = [b3,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,__ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv,__ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv,__Z12peek_state_xRK6QStateii,__Z12peek_state_zRK6QStateii,__ZN10emscripten8internal7InvokerIcJRK6QStateiEE6invokeEPFcS4_iEPS2_i,b3];
var FUNCTION_TABLE_iiiii = [b4,__Z7measureR6QStatelib,__ZN10emscripten8internal7InvokerIcJRK6QStateiiEE6invokeEPFcS4_iiEPS2_ii,b4];
var FUNCTION_TABLE_iiiiii = [b5,__ZN10emscripten8internal7InvokerIiJR6QStatelibEE6invokeEPFiS3_libEPS2_lib];
var FUNCTION_TABLE_v = [b6];
var FUNCTION_TABLE_vi = [b7,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,__ZN10__cxxabiv120__si_class_type_infoD0Ev,__ZN10__cxxabiv123__fundamental_type_infoD0Ev,__ZN10__cxxabiv119__pointer_type_infoD0Ev,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,__ZN10emscripten8internal14raw_destructorI6QStateEEvPT_,__Z10free_stateR6QState,b7,b7,b7,b7,b7];
var FUNCTION_TABLE_vii = [b8,__Z9initstae_R6QStatel,__Z8hadamardR6QStatel,__Z5phaseR6QStatel,__Z11clone_stateRK6QState,__ZN10emscripten8internal7InvokerIvJR6QStateEE6invokeEPFvS3_EPS2_,b8,b8];
var FUNCTION_TABLE_viii = [b9,__Z4cnotR6QStatell,__ZN10emscripten8internal7InvokerIvJR6QStatelEE6invokeEPFvS3_lEPS2_l,b9];
var FUNCTION_TABLE_viiii = [b10,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,__ZN10emscripten8internal7InvokerIvJR6QStatellEE6invokeEPFvS3_llEPS2_ll,b10,b10,b10];
var FUNCTION_TABLE_viiiii = [b11,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib];
var FUNCTION_TABLE_viiiiii = [b12,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib];

  return { ___errno_location: ___errno_location, ___getTypeName: ___getTypeName, _free: _free, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iii: dynCall_iii, dynCall_iiii: dynCall_iiii, dynCall_iiiii: dynCall_iiiii, dynCall_iiiiii: dynCall_iiiiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viii: dynCall_viii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, globalCtors: globalCtors, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(asmGlobalArg, asmLibraryArg, buffer);

var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___getTypeName = Module["___getTypeName"] = asm["___getTypeName"];
var _free = Module["_free"] = asm["_free"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
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
    var data = Module['readBinary'](memoryInitializer);
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
    }
    var doBrowserLoad = function() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
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
      }
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



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}





/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (runDependencies > 0) {
    return;
  }


  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

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
  } else {
    doRun();
  }
}
Module['run'] = run;


function exit(status, implicit) {

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
  } else {

    ABORT = true;
    EXITSTATUS = status;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  Module['quit'](status, new ExitStatus(status));
}

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    out(what);
    err(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  throw 'abort(' + what + '). Build with -s ASSERTIONS=1 for more info.';
}
Module['abort'] = abort;

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}


  Module["noExitRuntime"] = true;

run();





// {{MODULE_ADDITIONS}}



let QState = Module.QState;
let init_state = Module.init_state;
let free_state = Module.free_state;
let cnot = Module.cnot;
let hadamard = Module.hadamard;
let phase = Module.phase;
let measure = Module.measure;
let clone_state = Module.clone_state;
let peek_state_x = Module.peek_state_x;
let peek_state_z = Module.peek_state_z;
let peek_state_r = Module.peek_state_r;
export {QState, init_state, free_state, cnot, hadamard, phase, clone_state, measure, peek_state_x, peek_state_z, peek_state_r}
