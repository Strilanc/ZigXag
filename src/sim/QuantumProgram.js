// import {GeneralMap} from "src/base/GeneralMap.js";
// import {GeneralSet} from "src/base/GeneralSet.js";
// import {seq, Seq} from "src/base/Seq.js";
// import {equate} from "src/base/Equate.js"
// import {QubitAxis} from "src/sim/PauliProduct.js"
// import {PauliProduct} from "src/sim/PauliProduct.js";
//
//
// // class PssCircuit {
// //     /**
// //      * @param {!Array.<!PssOperation>} operations
// //      */
// //     constructor(operations = []) {
// //         this.operations = operations;
// //     }
// //
// //     /**
// //      * @returns {!string}
// //      */
// //     toString() {
// //         let body = this.statements.map((e, i) => `// ${i+1}\n${e}\n`).join('\n');
// //         return `QuantumStatement(QuantumProgram) {\n    ${body.split('\n').join('\n    ')}\n}`;
// //     }
// //
// //     /**
// //      * @param {*} other
// //      * @returns {!boolean}
// //      */
// //     isEqualTo(other) {
// //         return other instanceof QuantumProgram && equate(this.statements, other.statements);
// //     }
// //
// //     interpret(sim, out) {
// //         for (let statement of this.statements) {
// //             statement.interpret(sim, out);
// //         }
// //     }
// // }
// //
// // class PssOperation {
// //     /**
// //      * @param {!stim.TableauSimulator} sim
// //      * @returns {!Array.<!PssOperation>}
// //      */
// //     sim_solve(sim) {
// //         throw new Error("Not implemented.");
// //     }
// // }
// //
// // class PssStimOperation extends PssOperation {
// //     /**
// //      * @param {!string} gate_name
// //      * @param {!Array.<!int>}targets
// //      */
// //     constructor(gate_name, targets) {
// //         super();
// //         this.gate_name = gate_name;
// //         this.targets = targets;
// //     }
// //
// //     sim_solve(sim) {
// //         sim.do_operation(this.gate_name, this.targets, 0.0);
// //     }
// // }
// //
// // class PssUnsolvedMeasurement extends PssOperation {
// //     /**
// //      * @param {!string} gate_name
// //      * @param {!Array.<!int>}targets
// //      */
// //     constructor(gate_name, targets) {
// //         super();
// //         this.gate_name = gate_name;
// //         this.targets = targets;
// //     }
// //
// //     sim_solve(sim) {
// //         sim.do_operation(this.gate_name, this.targets, 0.0);
// //     }
// // }
//
// /**
//  * @param {!GeneralMap.<TKey, !Array.<TVal>>} multiMap
//  * @returns {!GeneralMap.<TVal, !Array.<TKey>>}
//  * @template TKey, TVal
//  */
// function inverseMultiMap(multiMap) {
//     let result = new GeneralMap();
//     for (let [key, vals] of multiMap.entries()) {
//         for (let val of vals) {
//             if (!result.has(val)) {
//                 result.set(val, []);
//             }
//             result.get(val).push(key);
//         }
//     }
//     return result;
// }
//
// /**
//  * @param {!Array.<![!int, T]>} indexedItems
//  * @param {T=undefined} defaultValue
//  * @returns {!Array.<T>}
//  * @template T
//  */
// function scatter(indexedItems, defaultValue=undefined) {
//     let result = [];
//     for (let [index, item] of indexedItems) {
//         while (result.length <= index) {
//             result.push(defaultValue);
//         }
//         result[index] = item;
//     }
//     return result;
// }
//
// /**
//  * @param {!Array.<T>} items
//  * @param {!int} index
//  * @param {T} defaultValue
//  * @param {T} item
//  * @template T
//  */
// function padSetTo(items, defaultValue, index, item) {
//     while (items.length <= index) {
//         items.push(defaultValue);
//     }
//     items[index] = item;
// }
//
// export {
//     inverseMultiMap,
//     scatter,
//     padSetTo,
// }
