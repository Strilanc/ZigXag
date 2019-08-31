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

// Cheat a little bit on the testing library being independent from what it tests
import {describe} from "src/base/Describe.js"
import {equate} from "src/base/Equate.js"

/** @type {!int} */
let assertionSubjectIndexForNextTest = 1;

function isArrayIsh(value) {
    return Array.isArray(value) ||
        value instanceof Float32Array ||
        value instanceof Float64Array ||
        value instanceof Int8Array ||
        value instanceof Int16Array ||
        value instanceof Int32Array ||
        value instanceof Uint8Array ||
        value instanceof Uint16Array ||
        value instanceof Uint32Array;
}

/**
 * @param {!string} message
 */
function fail(message) {
    throw new Error(message);
}

/**
 * @param {*} subject
 * @throws
 */
function sanityCheck(subject) {
    if (subject instanceof Map) {
        for (let k in subject) {
            if (subject.hasOwnProperty(k)) {
                throw new Error(`Map has property 'map[${k}]' instead of entry 'map.get(${k})'. Probably a mistake.`)
            }
        }
    }
}

/**
 * @param {*} subject
 * @param {*} other
 * @param {!number} epsilon
 * @returns {!boolean}
 * @private
 */
function isApproximatelyEqualToHelper(subject, other, epsilon) {
    if (subject === null) {
        return other === null;
    } else if (subject === undefined) {
        return other === undefined;
    } else if (subject.isApproximatelyEqualTo !== undefined) {
        return subject.isApproximatelyEqualTo(other, epsilon);
    } else if (typeof subject === 'number') {
        return subject === other ||
            (isNaN(subject) && isNaN(other)) ||
            (typeof other === 'number' && Math.abs(subject - other) < epsilon);
    } else if (isArrayIsh(subject)) {
        if (!isArrayIsh(other) || other.length !== subject.length) {
            return false;
        }
        for (let i = 0; i < subject.length; i++) {
            if (!isApproximatelyEqualToHelper(subject[i], other[i], epsilon)) {
                return false;
            }
        }
        return true;
    } else if (subject instanceof Object && subject.toString() === "[object Object]") {
        return isApproximatelyEqualToHelperDestructured(subject, other, epsilon);
    } else {
        fail('Expected ' + describe(subject) + ' to have an isApproximatelyEqualTo method');
        return false;
    }
}

/**
 * @param {!Object} subject
 * @param {!Object} other
 * @param {!number} epsilon
 * @returns {!boolean}
 * @private
 */
function isApproximatelyEqualToHelperDestructured(subject, other, epsilon) {
    let keys = [];
    for (let subjectKey in subject) {
        if (subject.hasOwnProperty(subjectKey)) {
            keys.push(subjectKey);
        }
    }
    for (let otherKey in other) {
        if (other.hasOwnProperty(otherKey) && !subject.hasOwnProperty(otherKey)) {
            return false;
        }
    }

    return keys.every(key => other.hasOwnProperty(key) &&
        isApproximatelyEqualToHelper(subject[key], other[key], epsilon));
}

class AssertionSubject {
    /**
     * @param {*} subject
     * @param {*} id
     * @param {*} info
     * @property {*} subject
     */
    constructor(subject, id=undefined, info=undefined) {
        sanityCheck(subject);
        assertionSubjectIndexForNextTest += 1;

        /**
         * The "actual" value, to be compared against expected values.
         * @type {*}
         */
        this.subject = subject;
        /**
         * @type {*}
         */
        this.id = id;
        /**
         * @type {*}
         */
        this.info = info;
    }

    /**
     * @param {*} newInfo
     * @returns {!AssertionSubject}
     */
    withInfo(newInfo) {
        assertionSubjectIndexForNextTest -= 1;
        return new AssertionSubject(this.subject, this.id, newInfo);
    }

    /**
     * @param {!string} message
     * @private
     */
    _fail(message) {
        let idMessage = this.id === undefined ? message : `${message} (${this.id})`;
        let infoMessage = this.info === undefined ? idMessage : `${idMessage} (info: ${describe(this.info)})`;
        fail(infoMessage);
    }

    /**
     * @private
     */
    _failExpected(relation, expected) {
        let act = describe(this.subject);
        let exp = describe(expected);
        if (act.length + exp.length < 50) {
            this._fail(`Got <${act}> but expected it ${relation} <${exp}>.`);
        } else {
            this._fail(`Got <\n\t${act}\n> but expected it ${relation} <\n\t${exp}\n>.`);
        }
    }

    /**
     * @param {*} items
     */
    iteratesAs(...items) {
        let actualItems = [];
        for (let item of this.subject) {
            if (actualItems.length > items.length * 2 + 100) {
                actualItems.push("{...}");
                break;
            }
            actualItems.push(item);
        }
        new AssertionSubject(actualItems, this.id).isEqualTo(items);
    }

    /**
     * @param {*} other
     */
    is(other) {
        if (!Object.is(this.subject, other)) {
            this._failExpected('to be the same object reference as', other);
        }
    }

    /**
     * @param {*} other
     */
    isEqualTo(other) {
        if (!equate(this.subject, other)) {
            this._failExpected('to equal', other);
        }
    }

    //noinspection JSUnusedGlobalSymbols
    /**
     * @param {*} other
     */
    isGreaterThan(other) {
        if (!(this.subject > other)) {
            this._failExpected('to be greater than', other);
        }
    }

    /**
     * @param {*} other
     */
    isLessThan(other) {
        if (!(this.subject < other)) {
            this._failExpected('to be less than', other);
        }
    }

    /**
     * @param {*} other
     */
    isNotEqualTo(other) {
        if (equate(this.subject, other)) {
            this._failExpected('to NOT equal', other);
        }
    }

    /**
     * @param {*} other
     * @param {=number} epsilon
     */
    isApproximatelyEqualTo(other, epsilon = 0.000001) {
        if (!isApproximatelyEqualToHelper(this.subject, other, epsilon)) {
            this._failExpected('to approximately equal', other);
        }
    }

    /**
     * @param {*} other
     * @param {=number} epsilon
     */
    isNotApproximatelyEqualTo(other, epsilon = 0.000001) {
        if (isApproximatelyEqualToHelper(this.subject, other, epsilon)) {
            this._failExpected('to NOT approximately equal', other);
        }
    }

    /**
     * @returns {Promise.<void>}
     */
    async asyncIsPendingPromise() {
        let {resolved, rejected, value} = await asyncPeekPromiseStatus(this.subject);
        if (resolved || rejected) {
            let descActual = describePromise(resolved, rejected, value);
            let descExpected = describePromise(false, false, undefined);
            this._fail(`Got <${descActual}> but expected a <${descExpected}>.`);
        }
    }

    /**
     * @param {*} expectedResult
     * @returns {Promise.<void>}
     */
    async asyncIsPromiseWithResult(expectedResult) {
        let {resolved, rejected, value} = await asyncPeekPromiseStatus(this.subject);
        if (!resolved) {
            let descActual = describePromise(resolved, rejected, value);
            let descExpected = describePromise(true, false, expectedResult);
            this._fail(`Got <${descActual}> but expected a <${descExpected}>.`);
        }
    }

    /**
     * @param {*} expectedError
     * @returns {Promise.<void>}
     */
    async asyncIsPromiseWithError(expectedError) {
        let {resolved, rejected, value} = await asyncPeekPromiseStatus(this.subject);
        if (!rejected) {
            let descActual = describePromise(resolved, rejected, value);
            let descExpected = describePromise(false, true, expectedError);
            this._fail(`Got <${descActual}> but expected a <${descExpected}>.`);
        }
    }
}

/**
 * Returns an assertion subject for the given value, which can be fluently extended with conditions like "isEqualTo".
 * @param {*} subject
 * @param {=undefined} extraArgCatcher
 * returns {!AssertionSubject}
 */
function assertThat(subject, extraArgCatcher) {
    if (extraArgCatcher !== undefined) {
        fail('Extra assertThat arg');
    }
    return new AssertionSubject(subject, 'assertThat #' + assertionSubjectIndexForNextTest);
}

function assertTrue(subject) {
    assertThat(subject).isEqualTo(true);
}

function assertFalse(subject) {
    assertThat(subject).isEqualTo(false);
}

/**
 * Invokes a function, requiring it to throw an exception. Returns the exception wrapped in an assertion subject.
 * @param {function()} func
 * @param {=undefined} extraArgCatcher
 * returns {!AssertionSubject}
 */
function assertThrows(func, extraArgCatcher) {
    if (extraArgCatcher !== undefined) {
        fail('Extra assertThrows arg');
    }
    try {
        func();
    } catch(ex) {
        return new AssertionSubject(ex, 'assertThrows');
    }
    fail('Expected an exception to be thrown by ' + func);
    return undefined;
}

/**
 * A named collection of tests.
 */
class Suite {
    /**
     * @param {!string} name
     */
    constructor(name) {
        Suite.suites.push(this);
        /** @type {!Array.<[!string, !function(!{warn_only: !boolean|!string}) : (undefined|!Promise)]>} */
        this.tests = [];
        /** @type {!Array.<[!string, !function(!{warn_only: !boolean|!string}) : (undefined|!Promise)]>} */
        this.later_tests = [];
         /** @type {!string} */
        this.name = name;
    }

    /**
     * @param {!string} name
     * @param {!function(!{warn_only: !boolean|!string}) : (undefined|!Promise)} method
     * @param {!boolean=false} later
     */
    test(name, method, later=false) {
        (later ? this.later_tests : this.tests).push([name, status => {
            assertionSubjectIndexForNextTest = 1;
            let result = method(status);
            if (result === undefined && assertionSubjectIndexForNextTest === 1) {
                console.warn(`No assertions in test '${name}' of suite '${this.name}'.`);
            }
            return result;
        }]);
    }
}

Suite.suites = [];

/**
 * @param {!Promise.<*>} promise
 * @returns {Promise.<!{resolved: !boolean, rejected: !boolean, value: *}>}
 */
async function asyncPeekPromiseStatus(promise) {
    if (!(promise instanceof Promise)) {
        throw new Error(`Not a promise: <${describe(promise)}>.`);
    }
    let resolved = false;
    let rejected = false;
    let value = undefined;
    promise.then(e => { resolved = true; value = e; });
    promise.catch(e => { rejected = true; value = e; });

    // Cycle the event loop a few times to allow promises to resolve.
    for (let i = 0; i < 10; i++) {
        await new Promise(resolve => resolve());
    }

    return {resolved, rejected, value};
}

class TypeUnknownToObjectUnderTest {
    toString() {
        return 'TypeUnknownToObjectUnderTest';
    }
}

/**
 * A utility for easily testing equality methods.
 */
class EqualsTester {
    constructor() {
        this._equivalence_groups = [
            [new TypeUnknownToObjectUnderTest()],
            [undefined],
            [null],
        ];
    }

    /**
     * Produces two items from the given factory then attempts to add them as a disjoint equivalence group.
     * @param {!function(): *} factory
     */
    assertAddGeneratedPair(factory) {
        this.assertAddGroup(factory(), factory());
    }

    /**
     * Attempts to add what should be a disjoint equivalence group to the equals tester.
     * @param {...*} group
     */
    assertAddGroup(...group) {
        let k = assertionSubjectIndexForNextTest;
        assertionSubjectIndexForNextTest += 1;

        for (let e1 of group) {
            for (let e2 of group) {
                if (!equate(e1, e2)) {
                    fail(`<${e1}> doesn't equal <${e2}> from same equivalence group. (assertAddGroup #${k})`);
                }
            }
        }

        for (let other of this._equivalence_groups) {
            for (let e1 of group) {
                for (let e2 of other) {
                    if (equate(e1, e2)) {
                        fail(`<${e1}> equals <${e2}> from disjoint equivalence group. (assertAddGroup #${k})`);
                    }
                }
            }
        }

        this._equivalence_groups.push(group);
    }
}

/**
 * @param {!boolean} resolved
 * @param {!boolean} rejected
 * @param {*} value
 * @returns {!string}
 */
function describePromise(resolved, rejected, value) {
    if (resolved) {
        return `ResolvedPromise(${describe(value)})`;
    }
    if (rejected) {
        return `RejectedPromise(${describe(value)})`;
    }
    return 'Pending Promise';
}

export {fail, assertThrows, assertTrue, assertFalse, assertThat, AssertionSubject, Suite, EqualsTester}
