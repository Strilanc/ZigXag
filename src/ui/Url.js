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

import {HistoryPusher} from "src/browser/HistoryPusher.js"

function hashSafeForUrl(jsonText) {
    if (jsonText.indexOf('%') !== -1 || jsonText.indexOf('&') !== -1) {
        jsonText = encodeURIComponent(jsonText);
    }
    return "#" + jsonText;
}

/**
 * @param {!Revision} revision
 */
function initUrlSync(revision) {
    const historyPusher = new HistoryPusher();
    const loadFromUrl = () => {
        historyPusher.currentStateIsMemorableButUnknown();
        let text = document.location.hash.substr(1);
        historyPusher.currentStateIsMemorableAndEqualTo(text);
        revision.clear(text);
        if (text === '') {
            historyPusher.currentStateIsNotMemorable();
        } else {
            historyPusher.stateChange(text, hashSafeForUrl(text));
        }
    };

    window.addEventListener('popstate', loadFromUrl);
    loadFromUrl();

    revision.latestActiveCommit().whenDifferent().skip(1).subscribe(text => {
        historyPusher.stateChange(text, hashSafeForUrl(text));
    });
}

export {initUrlSync}
