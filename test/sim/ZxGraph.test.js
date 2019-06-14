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

import {Suite, assertThat, assertThrows, assertTrue} from "test/TestUtil.js"
import {ZxGraph, ZxNodePos, ZxEdgePos, ZxPort} from "src/sim/ZxGraph.js"

let suite = new Suite("ZxGraph");


suite.test('node_init', () => {
    let n = new ZxNodePos(2, 3);
    assertThat(n.x).isEqualTo(2);
    assertThat(n.y).isEqualTo(3);
    assertThat(n).isEqualTo(n);
    assertThat(n).isEqualTo(new ZxNodePos(2, 3));
    assertThat(n).isNotEqualTo(new ZxNodePos(4, 3));
    assertThat(n).isNotEqualTo(new ZxNodePos(2, 4));
    assertThat(n).isNotEqualTo('test');
});

suite.test('node_adjacent_edge_positions', () => {
    let n = new ZxNodePos(2, 3);
    assertThat(n.adjacent_edge_positions()).isEqualTo([
        new ZxEdgePos(2, 3, true),
        new ZxEdgePos(2, 2, false),
        new ZxEdgePos(1, 3, true),
        new ZxEdgePos(2, 3, false),
    ]);
});

suite.test('node_ports', () => {
    let n = new ZxNodePos(2, 3);
    assertThat(n.ports()).isEqualTo([
        new ZxPort(new ZxEdgePos(2, 3, true), n),
        new ZxPort(new ZxEdgePos(2, 2, false), n),
        new ZxPort(new ZxEdgePos(1, 3, true), n),
        new ZxPort(new ZxEdgePos(2, 3, false), n),
    ]);
});

suite.test('node_toString', () => {
    let n = new ZxNodePos(2, 3);
    assertThat(n.toString()).isEqualTo('(2,3)');
});

function cnotGraph() {
    let g = new ZxGraph();
    g.add_line(new ZxNodePos(0, 0), new ZxNodePos(2, 0), ['in', '@', 'out']);
    g.add_line(new ZxNodePos(0, 1), new ZxNodePos(2, 1), ['in', 'O', 'out']);
    g.add_line(new ZxNodePos(1, 0), new ZxNodePos(1, 1));
    return g;
}

suite.test("toString", () => {
    assertThat(cnotGraph().toString()).isEqualTo(`
!---@---?
    |
    |
    |
!---O---?
    `.trim());
});

suite.test("serialize", () => {
    let g = cnotGraph();
    assertThat(ZxGraph.deserialize(g.serialize())).isEqualTo(g);
});
