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
import {ZxGraph, ZxNode, ZxEdge, ZxPort, edgeActionsToNodesAdjGraph} from "src/sim/ZxGraph.js"
import {GeneralMap} from "src/base/GeneralMap.js"
import {GeneralSet} from "src/base/GeneralSet.js"
import {seq, Seq} from "src/base/Seq.js"

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

    assertThat(cnotGraph().shifted(2, 1).toString()).isEqualTo(`



        !---@---?
            |
            |
            |
        !---O---?`);

    assertThat(cnotGraph().shifted(2, 1).toString(true)).isEqualTo(`
!---@---?
    |
    |
    |
!---O---?
    `.trim());

    assertThat(ZxGraph.fromDiagram(`
        +-s-@
        |
        h
        |
        O
    `).toString()).isEqualTo(`
+-S-@
|
H
|
O
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

suite.test('fromDiagram_modifierCharacters', () => {
    let g = ZxGraph.fromDiagram(`
        @---@!--O!--o!--O!
            |
            |
            |
            @!
            |
            |
            |
            o---O
    `);
    assertThat(g.toString()).isEqualTo(`
@---@!--O!--O!--O!
    |
    |
    |
    @!
    |
    |
    |
    O---O
    `.trim());
});

suite.test("diagramCrossingCharacters", () => {
    let diagramText = `
O-F-----------------O-------O-----------O-------O
                    |       |           |
                    |       |           |
                    |       |           |
O-F-O-----------O---+-------+---O-------+-------O
    |           |   |       |   |       |
    |           |   |       |   |       |
    |           |   |       |   |       |
    @---@-F-O   @---@-F-O   @---@-F-O   @---@-F-O
    |   |       |           |           |   |
    |   |       |           |           |   |
    |   |       |           |           |   |
O-F-O---+-------O-----------+-----------+---O---O
        |                   |           |
        |                   |           |
        |                   |           |
O-------O-------------------O-----------O-------?
    `;
    assertThat(ZxGraph.fromDiagram(diagramText).toString().trim()).isEqualTo(diagramText.trim())
});

suite.test("emptyGraph", () => {
    assertThat(ZxGraph.fromDiagram('')).isEqualTo(new ZxGraph());
    assertThat(ZxGraph.deserialize(':')).isEqualTo(new ZxGraph());
    assertThat(ZxGraph.deserialize('')).isEqualTo(new ZxGraph());
});

suite.test("opposite", () => {
    let graph = ZxGraph.fromDiagram(`
@---@---+
        |
        |
        |
O---+---+---O
        |
        |
        |
        +
        |
        |
        |
O---O---@---@
    `);

    let z = new ZxNode(0, 0);
    let a = new ZxNode(1, 0);
    let b = new ZxNode(2, 0);
    let c = new ZxNode(2, 1);
    let d = new ZxNode(2, 2);
    let e = new ZxNode(1, 1);
    let f = new ZxNode(3, 1);
    let za = new ZxEdge(z, a);
    let ab = new ZxEdge(a, b);
    let bc = new ZxEdge(b, c);
    let cd = new ZxEdge(c, d);
    let ce = new ZxEdge(c, e);
    let cf = new ZxEdge(c, f);

    // Across an edge.
    assertThat(graph.unblockedOppositeOfAcross(b, ab)).isEqualTo(a);
    assertThat(graph.unblockedOppositeOfAcross(a, ab)).isEqualTo(b);
    assertThat(graph.unblockedOppositeOfAcross(b, bc)).isEqualTo(c);
    assertThat(graph.unblockedOppositeOfAcross(c, bc)).isEqualTo(b);

    // Around the corner.
    assertThat(graph.unblockedOppositeOfAcross(ab, b)).isEqualTo(bc);
    assertThat(graph.unblockedOppositeOfAcross(bc, b)).isEqualTo(ab);

    // Through the crossing.
    assertThat(graph.unblockedOppositeOfAcross(bc, c)).isEqualTo(cd);
    assertThat(graph.unblockedOppositeOfAcross(cd, c)).isEqualTo(bc);
    assertThat(graph.unblockedOppositeOfAcross(ce, c)).isEqualTo(cf);
    assertThat(graph.unblockedOppositeOfAcross(cf, c)).isEqualTo(ce);

    // Blocked by the node along a line.
    assertThat(graph.unblockedOppositeOfAcross(za, a)).isEqualTo(undefined);
    assertThat(graph.unblockedOppositeOfAcross(ab, a)).isEqualTo(undefined);
});

suite.test("extendedUnblockedPath", () => {
    let graph = ZxGraph.fromDiagram(`
@---@---+
        |
        |
        |
O---+---+---O
        |
        |
        |
        +
        |
        |
        |
O---O---@---@
    `);

    // Ambiguous or blocked.
    assertThat(graph.extendedUnblockedPath(new ZxNode(0, 0))).isEqualTo(new GeneralSet());
    assertThat(graph.extendedUnblockedPath(new ZxNode(1, 0))).isEqualTo(new GeneralSet());
    assertThat(graph.extendedUnblockedPath(new ZxNode(0, 1))).isEqualTo(new GeneralSet());
    assertThat(graph.extendedUnblockedPath(new ZxNode(2, 1))).isEqualTo(new GeneralSet());

    let path1 = new GeneralSet(...ZxGraph.fromDiagram(`
@   @---+
        |
        |
        |
        +
        |
        |
        |
        +
        |
        |
        |
        @
    `).edges.keys());
    assertThat(graph.extendedUnblockedPath(new ZxEdge(new ZxNode(1, 0), new ZxNode(2, 0)))).isEqualTo(path1);
    assertThat(graph.extendedUnblockedPath(new ZxEdge(new ZxNode(2, 1), new ZxNode(2, 0)))).isEqualTo(path1);
    assertThat(graph.extendedUnblockedPath(new ZxNode(2, 0))).isEqualTo(path1);
    assertThat(graph.extendedUnblockedPath(new ZxNode(2, 2))).isEqualTo(path1);

    let path2 = new GeneralSet(...ZxGraph.fromDiagram(`
@



O---+---+---O
    `).edges.keys());
    assertThat(graph.extendedUnblockedPath(new ZxEdge(new ZxNode(0, 1), new ZxNode(1, 1)))).isEqualTo(path2);
    assertThat(graph.extendedUnblockedPath(new ZxNode(1, 1))).isEqualTo(path2);

    // Ambiguous union.
    assertThat(graph.extendedUnblockedPath(new ZxNode(2, 1), false)).isEqualTo(new GeneralSet(...path1, ...path2));
});

suite.test("tryFindFreePath_crossing", () => {
    let graph = ZxGraph.fromDiagram(`
    @







O---+---+---O
    `);
    let ns = Seq.range(9).map(i => new ZxNode(1, i)).toArray();
    let es = Seq.range(8).map(i => new ZxEdge(ns[i], ns[i+1])).toArray();
    let path = graph.tryFindFreePath(new ZxPort(es[0], ns[0]), ns[8]);
    assertThat(path).isEqualTo(seq(es).reverse().toArray());
});

suite.test('reflectedThrough', () => {
    let a = new ZxNode(2, 3);
    let b = new ZxNode(5, 7);
    let c = new ZxNode(11, 17);
    assertThat(a.reflectedThrough(a)).isEqualTo(a);
    assertThat(b.reflectedThrough(a)).isEqualTo(new ZxNode(-1, -1));
    assertThat(a.reflectedThrough(b)).isEqualTo(new ZxNode(8, 11));
    assertThat(c.reflectedThrough(a)).isEqualTo(new ZxNode(-7, -11));
});

suite.test("tryFindFreePath_doubleCrossing", () => {
    let graph = ZxGraph.fromDiagram(`
@---@---+
        |
        |
        |
O---+---+---O
        |
        |
        |
        +
        |
        |
        |
O---O---@---@
    `);
    let a = new ZxNode(1, 0);
    let b = new ZxNode(1, 1);
    let c = new ZxNode(1, 2);
    let d = new ZxNode(2, 2);
    let e = new ZxNode(3, 2);
    let f = new ZxNode(4, 2);
    let ab = new ZxEdge(a, b);

    let portPath = graph.tryFindFreePath(new ZxPort(ab, a), f);
    assertThat(portPath).isEqualTo([
        new ZxEdge(f, e),
        new ZxEdge(e, d),
        new ZxEdge(d, c),
        new ZxEdge(c, b),
        ab,
    ]);

    let nodePath = graph.tryFindFreePath(a, f);
    assertThat(nodePath).isEqualTo([
        new ZxEdge(f, e),
        new ZxEdge(e, d),
        new ZxEdge(d, c),
        new ZxEdge(c, b),
        ab,
    ]);
});

suite.test("toAdjGraph", () => {
    let graph = ZxGraph.fromDiagram(`
@---@---+
        |
        H
        |
O---+---+---O
        |
        |
        |
        +
        |
        |
        |
O---O---@---@
    `);


    let n00 = new ZxNode(0, 0);
    let n10 = new ZxNode(1, 0);
    let n20 = new ZxNode(2, 0);
    let n01 = new ZxNode(0, 1);
    let n11 = new ZxNode(1, 1);
    let n21 = new ZxNode(2, 1);
    let v21 = n21.upPort();
    let h21 = n21.leftPort();
    let n31 = new ZxNode(3, 1);
    let n22 = new ZxNode(2, 2);
    let n03 = new ZxNode(0, 3);
    let n13 = new ZxNode(1, 3);
    let n23 = new ZxNode(2, 3);
    let n33 = new ZxNode(3, 3);

    let json = graph.toAdjGraph().toJson();
    assertThat(json.nodes).isEqualTo([
        {source: n00, kind: '@'},
        {source: n10, kind: '@'},
        {source: n20, kind: '@'},

        {source: n01, kind: 'O'},
        {source: n11, kind: '@'},
        {source: h21, kind: '@'},
        {source: v21, kind: '@'},
        {source: n31, kind: 'O'},

        {source: n22, kind: '@'},

        {source: n03, kind: 'O'},
        {source: n13, kind: 'O'},
        {source: n23, kind: '@'},
        {source: n33, kind: '@'},
    ]);
    assertThat(seq(json.edges).sortedBy(e => e.data.source.orderVal()).toArray()).isEqualTo([
        {n1: 0, n2: 1, data: {source: new ZxEdge(n00, n10), kind: '-'}},
        {n1: 1, n2: 2, data: {source: new ZxEdge(n10, n20), kind: '-'}},
        {n1: 2, n2: 6, data: {source: new ZxEdge(n20, n21), kind: 'h'}},
        {n1: 3, n2: 4, data: {source: new ZxEdge(n01, n11), kind: '-'}},
        {n1: 4, n2: 5, data: {source: new ZxEdge(n11, n21), kind: '-'}},
        {n1: 5, n2: 7, data: {source: new ZxEdge(n21, n31), kind: '-'}},
        {n1: 6, n2: 8, data: {source: new ZxEdge(n21, n22), kind: '-'}},
        {n1: 8, n2: 11, data: {source: new ZxEdge(n22, n23), kind: '-'}},
        {n1: 9, n2: 10, data: {source: new ZxEdge(n03, n13), kind: '-'}},
        {n1: 10, n2: 11, data: {source: new ZxEdge(n13, n23), kind: '-'}},
        {n1: 11, n2: 12, data: {source: new ZxEdge(n23, n33), kind: '-'}},
    ]);
});

suite.test('edgeActionsToNodesAdjGraph', () => {
    let graph = ZxGraph.fromDiagram(`
        !-H-?
    `);
    let r = edgeActionsToNodesAdjGraph(graph.toAdjGraph());
    let a = new ZxNode(0, 0);
    let b = new ZxNode(1, 0);
    let ab = a.rightUnitEdge();
    assertThat(r.toJson()).isEqualTo({
        nodes: [
            {source: a, kind: 'in'},
            {source: b, kind: 'out'},
            {source: ab, kind: 'h'},
        ],
        edges: [
            {n1: 0, n2: 2, data: {source: ab, kind: '-'}},
            {n1: 2, n2: 1, data: {source: ab, kind: '-'}},
        ]
    });
});
