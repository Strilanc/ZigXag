// // Copyright 2017 Google Inc.
// //
// // Licensed under the Apache License, Version 2.0 (the "License");
// // you may not use this file except in compliance with the License.
// // You may obtain a copy of the License at
// //
// //     http://www.apache.org/licenses/LICENSE-2.0
// //
// // Unless required by applicable law or agreed to in writing, software
// // distributed under the License is distributed on an "AS IS" BASIS,
// // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// // See the License for the specific language governing permissions and
// // limitations under the License.
//
// import {Suite, assertThat, assertThrows, assertTrue} from "test/TestUtil.js"
// import {GeneralMap} from "src/base/GeneralMap.js"
// import {GeneralSet} from "src/base/GeneralSet.js"
//
// import {inverseMultiMap, scatter, padSetTo} from "src/sim/QuantumProgram.js"
//
// let suite = new Suite("QuantumProgram");
//
//
//
// suite.test('inverseMultiMap', () => {
//     assertThat(inverseMultiMap(new GeneralMap())).isEqualTo(new GeneralMap());
//     assertThat(inverseMultiMap(new GeneralMap(
//         ['a', [1]],
//     ))).isEqualTo(new GeneralMap(
//         [1, ['a']],
//     ));
//     assertThat(inverseMultiMap(new GeneralMap(
//         ['a', [1, 2]],
//         ['b', [1]],
//     ))).isEqualTo(new GeneralMap(
//         [1, ['a', 'b']],
//         [2, ['a']],
//     ));
// });
//
// suite.test('scatter', () => {
//     assertThat(scatter([])).isEqualTo([]);
//     assertThat(scatter([], 'def')).isEqualTo([]);
//     assertThat(scatter([[3, 'a']])).isEqualTo([undefined, undefined, undefined, 'a']);
//     assertThat(scatter([[3, 'a']], 'def')).isEqualTo(['def', 'def', 'def', 'a']);
//     assertThat(scatter([[3, 'a'], [1, 'b']])).isEqualTo([undefined, 'b', undefined, 'a']);
//     assertThat(scatter([[1, 'b'], [3, 'a']])).isEqualTo([undefined, 'b', undefined, 'a']);
// });
//
// suite.test('padSetTo', () => {
//     let a = [];
//     padSetTo(a, 'x', 2, 'y');
//     assertThat(a).isEqualTo(['x', 'x', 'y']);
//     padSetTo(a, 'z', 1, 't');
//     assertThat(a).isEqualTo(['x', 't', 'y']);
//     padSetTo(a, 'w', 6, 'r');
//     assertThat(a).isEqualTo(['x', 't', 'y', 'w', 'w', 'w', 'r']);
// });
