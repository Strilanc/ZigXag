import {Suite, assertThat, assertThrows, assertTrue} from "test/TestUtil.js"
import {ZxGraph, ZxNode, ZxEdge, ZxPort} from "src/sim/ZxGraph.js"
import {evalZxGraphGroundTruth} from "src/sim/ZxGraphGroundTruth.js"
import {Matrix} from "src/base/Matrix.js"
import {Complex} from "src/base/Complex.js"
import {GeneralMap} from "src/base/GeneralMap.js"
import {PauliProduct} from "src/sim/PauliProduct.js"
import {seq} from "src/base/Seq.js";

import {evalZxGraph, graphToPortQubitMapping, fixedPointsOfGraph} from "src/sim/ZxGraphEval.js"


let suite = new Suite("ZxGraphEval");


suite.test('fixedPointsOfGraph', () => {
    let graph = ZxGraph.fromDiagram(`
        !---@---?
            |
            |
            |
        !---O---?
    `);
    let qubitMapping = graphToPortQubitMapping(graph);
    let fixedPoints = fixedPointsOfGraph(graph, qubitMapping.map);
    assertThat(fixedPoints).isEqualTo([
        '+XXX.......',
        '+ZZ........',
        '+Z.Z.......',
        '+...ZZZ....',
        '+...XX.....',
        '+...X.X....',
        '+..XX......',
        '+..ZZ......',
        '+X.....X...',
        '+Z.....Z...',
        '+.X......X.',
        '+.Z......Z.',
        '+....X..X..',
        '+....Z..Z..',
        '+.....X...X',
        '+.....Z...Z',
    ].map(PauliProduct.fromString));
});
