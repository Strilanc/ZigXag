import {Suite, assertThat, assertThrows, assertTrue} from "test/TestUtil.js"
import {ZxGraph, ZxNodePos, ZxEdgePos, ZxPort} from "src/sim/ZxGraph.js"
import {evalZxGraph, stabilizerStateToWavefunction} from "src/sim/ZxGraphEval.js"
import {Matrix} from "src/base/Matrix.js"
import {Complex} from "src/base/Complex.js"
import {GeneralMap} from "src/base/GeneralMap.js"
import {PauliProduct} from "src/sim/PauliProduct.js"


let suite = new Suite("ZxGraphEval");


suite.test("evalZxGraph_cnot", () => {
    let g = ZxGraph.fromDiagram(`
        !---@---?
            |
            |
            |
        !---O---?
    `);

    let r = evalZxGraph(g);
    assertThat(r.stabilizers).isEqualTo([
        "+X.XX",
        "+Z.Z.",
        "+.X.X",
        "+.ZZZ",
    ].map(PauliProduct.fromString));
    assertThat(r.wavefunction).isApproximatelyEqualTo(Matrix.square(
        0.5, 0, 0, 0,
        0, 0, 0, 0.5,
        0, 0, 0.5, 0,
        0, 0.5, 0, 0,
    ));

    assertThat(r.quirk_url).isEqualTo(`
https://algassert.com/quirk#circuit={
    "cols":[
        ["•",1,1,1,1,1,1,1,"X"],
        [1,"•",1,1,1,1,"X"],
        [1,1,"•",1,"X"],
        [1,1,1,"•",1,1,1,1,1,"X"],
        [1,1,1,1,1,"•",1,"X"],
        ["•","X","X"],
        [1,1,1,"⊖","Z","Z"],
        ["H",1,1,1,"H","H"],
        ["Measure","Measure","Measure","Measure","Measure","Measure"],
        ["Z",1,1,1,"Z","Z",1,1,"•"],
        [1,"Z",1,1,1,1,1,1,"⊖"],
        [1,1,1,1,1,"Z",1,1,1,"•"],
        [1,"Z","Z","Z",1,1,1,1,1,"⊖"],
        [1,1,1,1,1,1,"Amps4"]
    ],
    "init":["+","+","+","+",0,"+"]
}
    `.split(/\s/).join(''));

    assertThat(r.qasm).isEqualTo(`
OPENQASM 2.0;
include "qelib1.inc";
qreg q[10]
creg m[6]

// Init per-edge EPR pairs.
h q[0];
h q[1];
h q[2];
h q[3];
h q[5];
cx q[0], q[8];
cx q[1], q[6];
cx q[2], q[4];
cx q[3], q[9];
cx q[5], q[7];

// Perform per-node toric measurements.
cx q[0], q[1];
cx q[0], q[2];
cx q[4], q[3];
cx q[5], q[3];
h q[0];
h q[4];
h q[5];
measure q[0] -> c[0]
measure q[1] -> c[1]
measure q[2] -> c[2]
measure q[3] -> c[3]
measure q[4] -> c[4]
measure q[5] -> c[5]

// Adjust Pauli frame based on measurements.
if (m[0] ^ m[4] ^ m[5]) {
    z q[8];
}
if (m[1]) {
    x q[8];
}
if (m[5]) {
    z q[9];
}
if (m[1] ^ m[2] ^ m[3]) {
    x q[9];
}
    `.trim());
});

suite.test("evalZxGraph_cnot_with_spandrels", () => {
    let g = ZxGraph.fromDiagram(`
        !---@---?
            |
            |
            |
        !---O---?



        O   O   O
        |   |   |
        |   |   |
        |   |   |
        O   O   O
    `);

    let r = evalZxGraph(g);
    assertThat(r.stabilizers).isEqualTo([
        "+X.XX",
        "+Z.Z.",
        "+.X.X",
        "+.ZZZ",
    ].map(PauliProduct.fromString));
    assertThat(r.wavefunction).isApproximatelyEqualTo(Matrix.square(
        0.5, 0, 0, 0,
        0, 0, 0, 0.5,
        0, 0, 0.5, 0,
        0, 0.5, 0, 0,
    ));
});

suite.test("evalZxGraph_swap", () => {
    let g = ZxGraph.fromDiagram(`
        !---@---O---@---?
            |   |   |
            |   |   |
            |   |   |
        !---O---@---O---?
    `);

    let r = evalZxGraph(g);
    assertThat(r.stabilizers).isEqualTo([
        "+X..X",
        "+Z..Z",
        "+.XX.",
        "+.ZZ.",
    ].map(PauliProduct.fromString));
    assertThat(r.wavefunction).isApproximatelyEqualTo(Matrix.square(
        0.5, 0, 0, 0,
        0, 0, 0.5, 0,
        0, 0.5, 0, 0,
        0, 0, 0, 0.5,
    ));
});

suite.test("evalZxGraph_notc", () => {
    let g = ZxGraph.fromDiagram(`
        !---O---?
            |
            |
            |
        !---@---?
    `);

    let r = evalZxGraph(g);
    assertThat(r.stabilizers).isEqualTo([
        "+X.X.",
        "+Z.ZZ",
        "+.XXX",
        "+.Z.Z",
    ].map(PauliProduct.fromString));
    assertThat(r.wavefunction).isApproximatelyEqualTo(Matrix.square(
        0.5, 0, 0, 0,
        0, 0.5, 0, 0,
        0, 0, 0, 0.5,
        0, 0, 0.5, 0,
    ));
});

suite.test("evalZxGraph_split", () => {
    let g = ZxGraph.fromDiagram(`
        !---@---?
            |
            |
            |
            @---?
    `);

    let r = evalZxGraph(g);
    let s = Math.sqrt(0.5);
    assertThat(r.wavefunction).isApproximatelyEqualTo(Matrix.fromRows([
        [s, 0],
        [0, 0],
        [0, 0],
        [0, s],
    ]));
    assertThat(r.stabilizers).isEqualTo([
        "+XXX",
        "+Z.Z",
        "+.ZZ",
    ].map(PauliProduct.fromString));
});


suite.test("evalZxGraph_fuse", () => {
    let g = ZxGraph.fromDiagram(`
        !---@---?
            |
            |
            |
        !---@
    `);

    let r = evalZxGraph(g);
    let s = Math.sqrt(0.5);
    assertThat(r.stabilizers).isEqualTo([
        "+XXX",
        "+Z.Z",
        "+.ZZ",
    ].map(PauliProduct.fromString));
    assertThat(r.wavefunction).isApproximatelyEqualTo(Matrix.fromRows([
        [s, 0, 0, 0],
        [0, 0, 0, s],
    ]));
});
