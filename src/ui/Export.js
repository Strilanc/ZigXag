// Copyright 2017 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {ObservableValue} from "src/base/Obs.js"
import {selectAndCopyToClipboard} from "src/browser/Clipboard.js"
import {ZxGraph} from "src/sim/ZxGraph.js";
import {evalZxGraph} from "src/sim/ZxGraphEval.js";

const exportsIsVisible = new ObservableValue(false);
const obsExportsIsShowing = exportsIsVisible.observable().whenDifferent();

/**
 * @param {!Revision} revision
 * @param {!Observable.<!boolean>} obsIsAnyOverlayShowing
 */
function initExports(revision, obsIsAnyOverlayShowing) {
    // Show/hide exports overlay.
    (() => {
        const exportButton = /** @type {!HTMLButtonElement} */ document.getElementById('export-button');
        const exportOverlay = /** @type {!HTMLDivElement} */ document.getElementById('export-overlay');
        const exportDiv = /** @type {HTMLDivElement} */ document.getElementById('export-div');
        exportButton.addEventListener('click', () => exportsIsVisible.set(true));
        obsIsAnyOverlayShowing.subscribe(e => { exportButton.disabled = e; });
        exportOverlay.addEventListener('click', () => exportsIsVisible.set(false));
        document.addEventListener('keydown', e => {
            const ESC_KEY = 27;
            if (e.keyCode === ESC_KEY) {
                exportsIsVisible.set(false)
            }
        });
        obsExportsIsShowing.subscribe(showing => {
            exportDiv.style.display = showing ? 'block' : 'none';
            if (showing) {
                document.getElementById('export-diagram-button').focus();
            }
        });
    })();

    /**
     * @param {!HTMLButtonElement} button
     * @param {!HTMLElement} outputElement
     * @param {!HTMLElement} outcomeElement
     * @param {undefined|!function(): !string} contentMaker
     */
    const setupButtonElementCopyToClipboard = (button, outputElement, outcomeElement, contentMaker=undefined) =>
        button.addEventListener('click', () => {
            if (contentMaker !== undefined) {
                outputElement.innerText = contentMaker();
            }

            //noinspection UnusedCatchParameterJS,EmptyCatchBlockJS
            try {
                selectAndCopyToClipboard(outputElement);
                outcomeElement.innerText = "Done!";
            } catch (ex) {
                outcomeElement.innerText = "It didn't work...";
                console.warn('Clipboard copy failed.', ex);
            }
            button.disabled = true;
            setTimeout(() => {
                outcomeElement.innerText = "";
                button.disabled = false;
            }, 1000);
        });

    const setupTextExport = (name, outputFunc) => {
        const button = /** @type {HTMLButtonElement} */ document.getElementById(`export-${name}-button`);
        const outputElement = /** @type {HTMLPreElement} */ document.getElementById(`export-${name}-output`);
        const outcomeElement = /** @type {HTMLElement} */ document.getElementById(`export-${name}-outcome`);
        obsIsAnyOverlayShowing.subscribe(() => {
            outputElement.innerText = '[not generated yet]';
        });
        setupButtonElementCopyToClipboard(
            button,
            outputElement,
            outcomeElement,
            outputFunc);
    };

    function currentGraph() {
        return ZxGraph.deserialize(revision.peekActiveCommit());
    }
    function currentEval() {
        return evalZxGraph(currentGraph());
    }

    setupTextExport('diagram', () => currentGraph().movedToOrigin().toString());
    setupTextExport('qasm', () => currentEval().qasm);
    setupTextExport('quirk', () => currentEval().quirkUrl);
}

export {initExports, obsExportsIsShowing}
