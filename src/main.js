/**
 * Entry point for the whole program.
 */

window.onerror = function(msg, url, line, col, error) {
    document.getElementById('err_msg').textContent = describe(msg);
    document.getElementById('err_line').textContent = describe(line);
    document.getElementById('err_time').textContent = '' + new Date().getMilliseconds();
    if (error instanceof DetailedError) {
        document.getElementById('err_gen').textContent = describe(error.details);
    }
};

import {DetailedError} from 'src/base/DetailedError.js'
import {describe} from "src/base/Describe.js";
import {Revision} from "src/base/Revision.js";
import {Reader, Writer} from "src/base/Serialize.js";
import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";

// let revision = new Revision([document.location.hash.substr(1)], 0, false);
// revision.latestActiveCommit().subscribe(hex => {
//     let preCamera = drawState.camera;
//     drawState = DrawState.read(Reader.fromHex(hex));
//     if (loadCamera) {
//         loadCamera = false;
//     } else {
//         drawState.camera = preCamera;
//     }
//     document.location.hash = hex;
// });
// revision.changes().subscribe(hex => {
//     if (hex === undefined) {
//         let writer = new Writer();
//         drawState.write(writer);
//         document.location.hash = writer.toHex();
//     }
// });

const canvas = /** @type {!HTMLCanvasElement} */ document.getElementById('main-canvas');
function main() {
    // const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    document.body.style.overflow = "hidden";  // Don't show scroll bars just because the canvas fills the screen.
    draw()
    // function render() {
    //     draw(gl);
    //     requestAnimationFrame(render);
    // }
    // requestAnimationFrame(render);
}

function draw() {
    let ctx = /** @type {!CanvasRenderingContext2D} */ canvas.getContext('2d');
    ctx.fillRect(5, 5, 10, 10);
}

setTimeout(main, 0);

let keyListeners = /** @type {!Map.<!int, !Array.<!function(!KeyboardEvent)>>} */ new Map();

/**
 * @param {!string|!int} keyOrCode
 * @param {!function(!KeyboardEvent)} func
 */
function addKeyListener(keyOrCode, func) {
    if (!Number.isInteger(keyOrCode)) {
        keyOrCode = keyOrCode.charCodeAt(0);
    }

    if (!keyListeners.has(keyOrCode)) {
        keyListeners.set(keyOrCode, []);
    }
    keyListeners.get(keyOrCode).push(func);
}

document.addEventListener('keydown', ev => {
    let handlers = keyListeners.get(ev.keyCode);
    if (handlers !== undefined) {
        ev.preventDefault();
        for (let handler of handlers) {
            handler(ev);
        }
    }
});
