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
import {ZxGraph, ZxNode, ZxEdge, ZxPort} from "src/sim/ZxGraph.js"
import {GeneralMap} from "src/base/GeneralMap.js"

let suite = new Suite("ZxGraph");


suite.test('node_init', () => {
    let n = new ZxNode(2, 3);
    assertThat(n.x).isEqualTo(2);
    assertThat(n.y).isEqualTo(3);
    assertThat(n).isEqualTo(n);
    assertThat(n).isEqualTo(new ZxNode(2, 3));
    assertThat(n).isNotEqualTo(new ZxNode(4, 3));
    assertThat(n).isNotEqualTo(new ZxNode(2, 4));
    assertThat(n).isNotEqualTo('test');
});

suite.test('node_adjacent_edge_positions', () => {
    let n = new ZxNode(2, 3);
    assertThat(n.unitEdges()).isEqualTo([
        ZxEdge.makeUnit(2, 3, true),
        ZxEdge.makeUnit(2, 2, false),
        ZxEdge.makeUnit(1, 3, true),
        ZxEdge.makeUnit(2, 3, false),
    ]);
});

suite.test('node_ports', () => {
    let n = new ZxNode(2, 3);
    assertThat(n.unitPorts()).isEqualTo([
        new ZxPort(ZxEdge.makeUnit(2, 3, true), n),
        new ZxPort(ZxEdge.makeUnit(2, 2, false), n),
        new ZxPort(ZxEdge.makeUnit(1, 3, true), n),
        new ZxPort(ZxEdge.makeUnit(2, 3, false), n),
    ]);
});

suite.test('node_toString', () => {
    let n = new ZxNode(2, 3);
    assertThat(n.toString()).isEqualTo('(2,3)');
});

function cnotGraph() {
    let g = new ZxGraph();
    g.add_line(new ZxNode(0, 0), new ZxNode(2, 0), ['in', '@', 'out']);
    g.add_line(new ZxNode(0, 1), new ZxNode(2, 1), ['in', 'O', 'out']);
    g.add_line(new ZxNode(1, 0), new ZxNode(1, 1));
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

suite.test('fromDiagram', () => {
    let diagram = `
            !---@---?
                |
                |
                |
            !---@
    `;
    assertThat(ZxGraph.fromDiagram(diagram).toString()).isEqualTo(`
!---@---?
    |
    |
    |
!---@
    `.trim());

    assertThrows(() => ZxGraph.fromDiagram(`
@---@
|
@---@
    `));

    assertThrows(() => ZxGraph.fromDiagram(`
@---@
|
|
@---@
    `));

    assertThrows(() => ZxGraph.fromDiagram(`
@--@
|
|
|
@--@
    `));

    assertThrows(() => ZxGraph.fromDiagram(`
@-@
|
|
|
@-@
    `));

    assertThat(ZxGraph.fromDiagram(`
@---@
|
|
|
@-X-@
    `)).isEqualTo(new ZxGraph(
        new GeneralMap(
            [new ZxNode(0, 0), '@'],
            [new ZxNode(1, 0), '@'],
            [new ZxNode(0, 1), '@'],
            [new ZxNode(1, 1), '@'],
        ),
        new GeneralMap(
            [ZxEdge.makeUnit(0, 0, false), '-'],
            [ZxEdge.makeUnit(0, 0, true), '-'],
            [ZxEdge.makeUnit(0, 1, true), 'x'],
        ),
    ));

    assertThat(ZxGraph.fromDiagram(`
@---@
|
|
|
@---@
    `)).isNotEqualTo(undefined);
});

suite.test("diagramCrossingCharacters", () => {
    let diagramText = `
O-f-----------------O-------O-----------O-------O
                    |       |           |
                    |       |           |
                    |       |           |
O-f-O-----------O---+-------+---O-------+-------O
    |           |   |       |   |       |
    |           |   |       |   |       |
    |           |   |       |   |       |
    @---@-f-O   @---@-f-O   @---@-f-O   @---@-f-O
    |   |       |           |           |   |
    |   |       |           |           |   |
    |   |       |           |           |   |
O-f-O---+-------O-----------+-----------+---O---O
        |                   |           |
        |                   |           |
        |                   |           |
O-------O-------------------O-----------O-------?
    `;
    assertThat(ZxGraph.fromDiagram(diagramText).toString().trim()).isEqualTo(diagramText.trim())
});

suite.test("emptyGraph", () => {
    assertThat(ZxGraph.fromDiagram('')).isEqualTo(new ZxGraph());
});
