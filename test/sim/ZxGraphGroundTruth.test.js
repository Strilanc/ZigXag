import {Suite, assertThat, assertThrows, assertTrue} from "test/TestUtil.js"
import {ZxGraph, ZxNodePos, ZxEdgePos, ZxPort} from "src/sim/ZxGraph.js"
import {Matrix} from "src/base/Matrix.js"
import {Complex} from "src/base/Complex.js"
import {PauliProduct} from "src/sim/PauliProduct.js"

import {zBasisEqualityMatrix, xBasisEqualityMatrix, Tensor, evalZxGraphGroundTruth} from "src/sim/ZxGraphGroundTruth.js"


let suite = new Suite("ZxGraphGroundTruth");


suite.test("zBasisEqualityTensor", () => {
    assertThat(zBasisEqualityMatrix(0, 0)).isApproximatelyEqualTo(Matrix.square(2));
    assertThat(zBasisEqualityMatrix(0, 1)).isApproximatelyEqualTo(Matrix.col(1, 1));
    assertThat(zBasisEqualityMatrix(1, 1)).isApproximatelyEqualTo(Matrix.square(1, 0, 0, 1));
    assertThat(zBasisEqualityMatrix(2, 3)).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 1],
    ]));
    let zero3 = Matrix.col(1, 0, 0, 0, 0, 0, 0, 0);
    let zero2 = Matrix.col(1, 0, 0, 0);
    let one3 = Matrix.col(0, 0, 0, 0, 0, 0, 0, 1);
    let one2 = Matrix.col(0, 0, 0, 1);
    assertThat(zBasisEqualityMatrix(3, 2).times(zero3)).isApproximatelyEqualTo(zero2);
    assertThat(zBasisEqualityMatrix(3, 2).times(one3)).isApproximatelyEqualTo(one2);
});

suite.test("xBasisEqualityTensor", () => {
    assertThat(xBasisEqualityMatrix(0, 0)).isApproximatelyEqualTo(Matrix.square(2));
    assertThat(xBasisEqualityMatrix(0, 1)).isApproximatelyEqualTo(Matrix.col(Math.sqrt(2), 0));
    assertThat(xBasisEqualityMatrix(1, 1)).isApproximatelyEqualTo(Matrix.square(1, 0, 0, 1));
    assertThat(xBasisEqualityMatrix(2, 3)).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0, 0, 1],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [1, 0, 0, 1],
        [0, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 0],
    ]).times(Math.sqrt(1/8)));
    let plus4 = Matrix.col(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1).times(0.25);
    let plus3 = Matrix.col(1, 1, 1, 1, 1, 1, 1, 1).times(Math.sqrt(1/8));
    let plus2 = Matrix.col(0.5, 0.5, 0.5, 0.5);
    let minus4 = Matrix.col(1, -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, -1, 1).times(0.25);
    let minus3 = Matrix.col(1, -1, -1, 1, -1, 1, 1, -1).times(Math.sqrt(1/8));
    let minus2 = Matrix.col(0.5, -0.5, -0.5, 0.5);
    assertThat(xBasisEqualityMatrix(3, 2).times(plus3)).isApproximatelyEqualTo(plus2);
    assertThat(xBasisEqualityMatrix(3, 2).times(minus3)).isApproximatelyEqualTo(minus2);
    assertThat(xBasisEqualityMatrix(4, 3).times(plus4)).isApproximatelyEqualTo(plus3);
    assertThat(xBasisEqualityMatrix(4, 3).times(minus4)).isApproximatelyEqualTo(minus3);
    assertThat(xBasisEqualityMatrix(4, 2).times(plus4)).isApproximatelyEqualTo(plus2);
    assertThat(xBasisEqualityMatrix(4, 2).times(minus4)).isApproximatelyEqualTo(minus2);
    assertThat(xBasisEqualityMatrix(2, 4).times(plus2)).isApproximatelyEqualTo(plus4);
    assertThat(xBasisEqualityMatrix(2, 4).times(minus2)).isApproximatelyEqualTo(minus4);
});

/**
 * @param {!int} n
 * @returns {!Array.<ZxPort>}
 */
function arbitraryPorts(n) {
    let result = [];
    for (let k = 0; k < n; k++) {
        result.push(new ZxPort(new ZxEdgePos(k, 0, false), new ZxNodePos(k, 0)));
    }
    return result;
}

suite.test('contracted', () => {
    let [a1, a2, b1, b2] = arbitraryPorts(4);
    let a = new Tensor(Matrix.col(1, 2, 3, 4), [a1, a2]);
    let b = new Tensor(Matrix.col(2, 3, 5, 7), [b1, b2]);
    assertThat(a.contracted(a2, b, b1)).isEqualTo(new Tensor(
        Matrix.col(11, 16, 26, 38),
        [a1, b2]
    ));
    assertThat(a.contracted(a1, b, b2)).isEqualTo(new Tensor(
        Matrix.col(12, 26, 17, 37),
        [a2, b1]
    ));
    assertThat(a.contracted(a1, a, a2)).isEqualTo(new Tensor(
        Matrix.solo(5),
        []
    ));
});

suite.test('inline_applyMatrixToPort', () => {
    let [a, b] = arbitraryPorts(2);
    let t = new Tensor(Matrix.col(1, 0, 0, 0), [a, b]);
    let h = Matrix.square(1, 1, 1, -1);
    let z = Matrix.square(1, 0, 0, -1);
    t.inline_applyMatrixToPort(h, a);
    assertThat(t.data).isEqualTo(Matrix.col(1, 1, 0, 0));
    t.inline_applyMatrixToPort(h, b);
    assertThat(t.data).isEqualTo(Matrix.col(1, 1, 1, 1));
    t.inline_applyMatrixToPort(z, b);
    assertThat(t.data).isEqualTo(Matrix.col(1, 1, -1, -1));
    t.inline_applyMatrixToPort(h, a);
    assertThat(t.data).isEqualTo(Matrix.col(2, 0, -2, -0));
    t.inline_applyMatrixToPort(h, b);
    assertThat(t.data).isEqualTo(Matrix.col(0, 0, 4, -0));
});

suite.test('inline_reorderPorts', () => {
    let [a, b, c] = arbitraryPorts(3);
    let t = new Tensor(Matrix.col(0, 1, 2, 3, 4, 5, 6, 7), [a, b, c]);

    t.inline_reorderPorts([c, b, a]);
    assertThat(t).isEqualTo(new Tensor(
        Matrix.col(0, 4, 2, 6, 1, 5, 3, 7),
        [c, b, a]));

    t.inline_reorderPorts([a, c, b]);
    assertThat(t).isEqualTo(new Tensor(
        Matrix.col(0, 1, 4, 5, 2, 3, 6, 7),
        [a, c, b]));
});

suite.test('evalZxGraphGroundTruth_identity', () => {
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---?
    `))).isApproximatelyEqualTo(
        Matrix.identity(2)
    );

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        ?---!
    `))).isApproximatelyEqualTo(
        Matrix.identity(2)
    );

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---@---?
    `))).isApproximatelyEqualTo(
        Matrix.identity(2)
    );

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---O---?
    `))).isApproximatelyEqualTo(
        Matrix.identity(2)
    );

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---O
            |
            |
            |
            ?
    `))).isApproximatelyEqualTo(
        Matrix.identity(2)
    );

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---O   ?
            |   |
            |   |
            |   |
            @---@---@
    `))).isApproximatelyEqualTo(
        Matrix.identity(2)
    );
});

suite.test('evalZxGraphGroundTruth_cnot', () => {
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---O---?
            |
            |
            |
        !---@---?
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 1],
        [0, 0, 1, 0],
    ]).times(Math.sqrt(0.5)));
});

suite.test('evalZxGraphGroundTruth_notc', () => {
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---@---?
            |
            |
            |
        !---O---?
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0, 0, 0],
        [0, 0, 0, 1],
        [0, 0, 1, 0],
        [0, 1, 0, 0],
    ]).times(Math.sqrt(0.5)));
});

suite.test('evalZxGraphGroundTruth_basisChange', () => {
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !-X-?
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [0, 1],
        [1, 0],
    ]));

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !-Z-?
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0],
        [0, -1],
    ]));

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !-S-?
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0],
        [0, Complex.I],
    ]));

    let a = new Complex(0.5, 0.5);
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !-F-?
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [a, a.conjugate()],
        [a.conjugate(), a],
    ]));

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !-H-@-S-@-H-?
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [a, a.conjugate()],
        [a.conjugate(), a],
    ]));

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !-H-?
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 1],
        [1, -1],
    ]).times(Math.sqrt(0.5)));

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !-H-@-F-@-S-@-F-?
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0],
        [0, 1],
    ]).times(Complex.polar(1, Math.PI / 4)));
});

suite.test('evalZxGraphGroundTruth_x_measure', () => {
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---O---?
            |
            |
            |
            @
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 1],
        [1, 1],
    ]).times(Math.sqrt(0.5)));
});

suite.test('evalZxGraphGroundTruth_z_measure', () => {
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---@---?
            |
            |
            |
            O
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0],
        [0, 0],
    ]).times(Math.sqrt(2)));
});

suite.test('evalZxGraphGroundTruth_decomposedHadamard', () => {
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !-S-O-S-?
            |
            S
            |
            @
            |
            Z
            |
            @
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 1],
        [1, -1],
    ]).times(Math.sqrt(0.5)));
});

suite.test('evalZxGraphGroundTruth_selfLoop', () => {
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---O---O---?
            |   |
            |   |
            |   |
            O---O
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [1, 0],
        [0, 1],
    ]));

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---O---O---?
            |   |
            |   |
            |   |
            O-X-O
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [0, 1],
        [1, 0],
    ]));

    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---O---O---?
            |   |
            |   |
            |   |
            O-Z-O
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [0, 0],
        [0, 0],
    ]));
});

suite.test('evalZxGraphGroundTruth_disjoint', () => {
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---O---?



        !---O---?
    `))).isApproximatelyEqualTo(Matrix.identity(4));
});

suite.test('evalZxGraphGroundTruth_disjoint', () => {
    assertThat(evalZxGraphGroundTruth(ZxGraph.fromDiagram(`
        !---O-X-?



        !---O---?
    `))).isApproximatelyEqualTo(Matrix.fromRows([
        [0, 1, 0, 0],
        [1, 0, 0, 0],
        [0, 0, 0, 1],
        [0, 0, 1, 0],
    ]))
});
