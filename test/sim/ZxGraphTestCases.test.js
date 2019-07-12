import {Suite, assertThat, assertThrows, assertTrue} from 'test/TestUtil.js'
import {ZxGraph, ZxNode, ZxEdge, ZxPort} from 'src/sim/ZxGraph.js'
import {evalZxGraph, graphToPortQubitMapping, fixedPointsOfGraph} from 'src/sim/ZxGraphEval.js'
import {evalZxGraphGroundTruth} from 'src/sim/ZxGraphGroundTruth.js'
import {Matrix} from 'src/base/Matrix.js'
import {Complex} from 'src/base/Complex.js'
import {GeneralMap} from 'src/base/GeneralMap.js'
import {PauliProduct} from 'src/sim/PauliProduct.js'
import {seq} from 'src/base/Seq.js';


let suite = new Suite('ZxGraphTestCases');

let _nextTestCaseId = 0;
const ALLOWED_ATTRS = new Set([
    'name',
    'qasm',
    'quirk',
    'diagram',
    'stabilizers',
    'alternates',
    'wavefunction',
    'satisfiable',
    'gain',
    'tensor',
]);

/**
 * @param {!{
 *     name?: undefined|!string,
 *     diagram: !string,
 *     alternates?: !Array.<!string>,
 *     quirk?: !string,
 *     qasm?: !string,
 *     stabilizers?: !Array.<!string>,
 *     tensor?: !Matrix,
 *     wavefunction?: !Matrix,
 *     gain?: !int|!float|!Complex
 *     satisfiable?: !boolean,
 * }} attrs
 */
function graphTestCase(attrs) {
    let name = attrs.name || `GraphTestCase_${_nextTestCaseId}`;
    let diagram = attrs.diagram;

    _nextTestCaseId += 1;
    for (let key of Object.keys(attrs)) {
        if (!ALLOWED_ATTRS.has(key)) {
            throw new Error(`Unexpected graph test case attribute: ${key}`);
        }
    }
    suite.test(name, () => {
        // Fill in.
        if (attrs.wavefunction === undefined && attrs.gain !== undefined && attrs.gain !== undefined) {
            attrs.wavefunction = attrs.tensor.times(Complex.ONE.dividedBy(attrs.gain));
        }
        if (attrs.tensor === undefined && attrs.gain !== undefined && attrs.wavefunction !== undefined) {
            attrs.tensor = attrs.wavefunction.times(attrs.gain);
        }

        let graph = ZxGraph.fromDiagram(diagram);
        let result = evalZxGraph(graph);
        let ground = evalZxGraphGroundTruth(graph);
        let groundSatisfiable = !ground.isZero(1.0e-8);

        // Compare to ground truth.
        assertThat(result.satisfiable).withInfo(
            {diagram, test: 'result.satisfiable == groundSatisfiable'}
        ).isEqualTo(groundSatisfiable);
        if (groundSatisfiable) {
            assertThat(result.wavefunction.phaseMatchedTo(ground, true)).withInfo(
                {diagram, test: 'result.wavefunction ~= c*ground'}
            ).isApproximatelyEqualTo(ground);
        }

        // Compare to manual data.
        if (attrs.tensor !== undefined) {
            assertThat(ground).withInfo(
                {diagram, test: 'ground ~= attrs.tensor'}
            ).isApproximatelyEqualTo(attrs.tensor);
        }
        if (attrs.wavefunction !== undefined) {
            assertThat(result.wavefunction).withInfo(
                {diagram, test: 'result.wavefunction ~= attrs.wavefunction'}
            ).isApproximatelyEqualTo(attrs.wavefunction);
        }
        if (attrs.satisfiable !== undefined) {
            assertThat(groundSatisfiable).withInfo(
                {diagram, test: 'groundSatisfiable == attrs.satisfiable'}
            ).isEqualTo(attrs.satisfiable);
        }
        if (attrs.stabilizers !== undefined) {
            assertThat(result.stabilizers).withInfo(
                {diagram, test: 'result.stabilizers == attrs.stabilizers'}
            ).isEqualTo(attrs.stabilizers.map(PauliProduct.fromString));
        }
        if (attrs.quirk !== undefined) {
            assertThat(result.quirkUrl).withInfo(
                {diagram, test: 'result.quirkUrl == attrs.quirk'}
            ).isEqualTo(attrs.quirk.split(/\s/).join(''));
        }
        if (attrs.qasm !== undefined) {
            assertThat(result.qasm).withInfo(
                {diagram, test: 'result.qasm == attrs.qasm'}
            ).isEqualTo(attrs.qasm.trim().split(/\n */).join('\n'));
        }

        // Compare to alt diagrams.
        for (let altDiagram of attrs.alternates || []) {
            let altGraph = ZxGraph.fromDiagram(altDiagram);
            let altResult = evalZxGraph(altGraph);
            let altGround = evalZxGraphGroundTruth(altGraph);
            if (groundSatisfiable) {
                assertThat(altResult.wavefunction).withInfo(
                    {diagram, altDiagram, test: 'altResult.wavefunction ~= result.wavefunction'}
                ).isApproximatelyEqualTo(result.wavefunction);
                assertThat(altResult.stabilizers).withInfo(
                    {diagram, altDiagram, test: 'altResult.stabilizers == result.stabilizers'}
                ).isEqualTo(result.stabilizers);
            }
            assertThat(altResult.satisfiable).withInfo(
                {diagram, altDiagram, test: 'altResult.satisfiable == result.satisfiable'}
            ).isEqualTo(result.satisfiable);
            assertThat(altResult.successProbability).withInfo(
                {diagram, altDiagram, test: 'altResult.successProbability == result.successProbability'}
            ).isEqualTo(result.successProbability);
            assertThat(altGround).withInfo(
                {diagram, altDiagram, test: 'altGround ~= ground'}
            ).isApproximatelyEqualTo(ground);
        }
    });
}

/**
 * @param {!string} diagram
 */
function identityGraphTestCase(diagram) {
    graphTestCase({
        name: `IdentityTestCase_${_nextTestCaseId}`,
        diagram: diagram,
        satisfiable: true,
        stabilizers: [
            '+XX',
            '+ZZ'
        ],
        tensor: Matrix.identity(2),
        gain: Math.sqrt(2),
    });
}

/**
 * @param {!string} diagram
 */
function unsatisfiableGraphTestCase(diagram) {
    graphTestCase({
        name: `ZeroTestCase_${_nextTestCaseId}`,
        diagram: diagram,
        satisfiable: false,
    });
}

/**
 * @param {!string} diagram
 */
function satisfiableGraphTestCase(diagram) {
    graphTestCase({
        name: `NonZeroTestCase_${_nextTestCaseId}`,
        diagram: diagram,
        satisfiable: true,
    });
}

identityGraphTestCase('!---?');
identityGraphTestCase('?---!');
identityGraphTestCase('?-S-+-A-!');
identityGraphTestCase('?-F-+-W-!');
identityGraphTestCase('!---Z-Z-?');
identityGraphTestCase('!---X-X-?');
identityGraphTestCase('!---S-A-?');
identityGraphTestCase('!---F-W-?');
identityGraphTestCase('?-S-+-A-!');
identityGraphTestCase('?-F-+-W-!');
identityGraphTestCase('!---+---?');
identityGraphTestCase('!---@---?');
identityGraphTestCase('!---O---?');
identityGraphTestCase('!---@---O---+---?');
identityGraphTestCase(`
    !---O
        |
        |
        |
        ?
`);
identityGraphTestCase(`
    !---@   ?
        |   |
        |   |
        |   |
        +---O
`);
identityGraphTestCase(`
    !---@---@---?
        |   |
        |   |
        |   |
        @---@
`);
identityGraphTestCase(`
    !---O---O---?
        |   |
        |   |
        |   |
        O---O
`);
identityGraphTestCase(`
    !---O   ?
        |   |
        |   |
        |   |
        @---@---@
`);
identityGraphTestCase(`
    !---@   ?
        |   |
        |   |
        |   |
        O---O---O
`);
identityGraphTestCase(`
    ?---@   !
        |   |
        |   |
        |   |
        O---O---O
        |   |
        |   |
        |   |
        O---O
`);
graphTestCase({
    name: 'inputIdentity',
    diagram: `
        ?   ?
        |   |
        |   |
        |   |
        +---+
    `,
    stabilizers: [
        '+XX',
        '+ZZ'
    ],
    tensor: Matrix.col(1, 0, 0, 1),
    gain: Math.sqrt(2),
});
graphTestCase({
    name: 'outputIdentity',
    diagram: `
        +---+
        |   |
        |   |
        |   |
        !   !
    `,
    stabilizers: [
        '+XX',
        '+ZZ'
    ],
    tensor: Matrix.row(1, 0, 0, 1),
    gain: Math.sqrt(2),
});

unsatisfiableGraphTestCase(`
    !---O---+
        |   |
        |   Z
        |   |
    ?---O---+
`);
unsatisfiableGraphTestCase(`
    !---O-Z-+
        |   |
        |   Z
        |   |
    ?---O-Z-+
`);
unsatisfiableGraphTestCase(`
    !---O---O---?
        |   |
        |   |
        |   |
        O-Z-O
`);
unsatisfiableGraphTestCase(`
    !---O---+
        |   |
        |   s
        |   |
    ?---O-s-+
`);
unsatisfiableGraphTestCase(`
    !---@---+
        |   |
        |   f
        |   |
    ?---@-f-+
`);
unsatisfiableGraphTestCase(`
    !---@---+
        |   |
        |   X
        |   |
    ?---@---+
`);
unsatisfiableGraphTestCase(`
    !---O-H-+
        |   |
        |   X
        |   |
    ?---O-H-+
`);
unsatisfiableGraphTestCase(`
    +---+
    |   |
    |   |
    |   |
    +-X-+
`);
unsatisfiableGraphTestCase(`
    +---+
    |   |
    |   |
    |   |
    +-Z-+
`);
unsatisfiableGraphTestCase(`
    +---+
    |   |
    |   X
    |   |
    +-Z-+
`);
unsatisfiableGraphTestCase(`
    +-s-+
    |   |
    |   |
    |   |
    +-s-+
`);
unsatisfiableGraphTestCase(`
    +---+
    |   |
    |   |
    |   |
    +-H-+
`);

satisfiableGraphTestCase(`
    !---O---+
        |   |
        |   |
        |   |
    ?---O---+
`);
satisfiableGraphTestCase(`
    !---O-Z-+
        |   |
        X   X
        |   |
    ?---O-Z-+
`);
satisfiableGraphTestCase(`
    !---@---+
        |   |
        |   |
        |   |
    ?---@---+
`);
satisfiableGraphTestCase(`
    !---O---+
        |   |
        |   X
        |   |
    ?---O---+
`);
satisfiableGraphTestCase(`
    !---@---+
        |   |
        |   Z
        |   |
    ?---@---+
`);
satisfiableGraphTestCase(`
    !---O---+
        |   |
        |   X
        |   |
    ?---O-X-+
`);
satisfiableGraphTestCase(`
    !---O-X-+
        |   |
        |   Z
        |   |
    ?---O-Z-+
`);
satisfiableGraphTestCase(`
    !---O-f-+
        |   |
        |   f
        |   |
    ?---O-X-+
`);
satisfiableGraphTestCase(`
    +---+
    |   |
    |   X
    |   |
    +-X-+
`);
satisfiableGraphTestCase(`
    +---+
    |   |
    Z   |
    |   |
    +-Z-+
`);
satisfiableGraphTestCase(`
    +-f-+
    |   |
    |   f
    |   |
    +-X-+
`);
satisfiableGraphTestCase(`
    +---+
    |   |
    s   s
    |   |
    +-Z-+
`);
satisfiableGraphTestCase(`
    +---+
    |   |
    f   f
    |   |
    +-X-+
`);

graphTestCase({
    name: 'cnot',
    diagram: `
        !---@---?
            |
            |
            |
        !---O---?
    `,
    stabilizers: [
        '+X.XX',
        '+Z.Z.',
        '+.X.X',
        '+.ZZZ',
    ],
    wavefunction: Matrix.fromRows([
        [0.5, 0, 0, 0],
        [0, 0, 0, 0.5],
        [0, 0, 0.5, 0],
        [0, 0.5, 0, 0],
    ]),
    gain: Math.sqrt(2),
    quirk: `
        https://algassert.com/quirk#circuit={
            "cols":[
                ["•",1,1,1,1,1,"X"],
                [1,"•",1,1,1,1,1,1,"X"],
                [1,1,"•","X"],
                [1,1,1,1,"•",1,1,"X"],
                [1,1,1,1,1,"•",1,1,1,"X"],
                ["•","X","X"],
                [1,1,1,"⊖","Z","Z"],
                ["H",1,1,1,"H","H"],
                ["Measure","Measure","Measure","Measure","Measure","Measure"],
                [1,"Z",1,1,1,1,1,1,"⊖"],
                ["Z",1,1,1,"Z",1,1,1,"•"],
                [1,1,"Z","Z",1,1,1,1,1,"⊖"],
                [1,1,1,1,"Z","Z",1,1,1,"•"],
                [1,1,1,1,1,1,"Amps4"]
            ],
            "init":["+","+","+",0,"+","+"]
        }
    `,
    qasm: `
        OPENQASM 2.0;
        include "qelib1.inc";
        qreg q[10];
        creg m_0[1];
        creg m_1[1];
        creg m_2[1];
        creg m_3[1];
        creg m_4[1];
        creg m_5[1];
        
        // Init per-edge EPR pairs.
        h q[0];
        h q[1];
        h q[2];
        h q[4];
        h q[5];
        cx q[0], q[6];
        cx q[1], q[8];
        cx q[2], q[3];
        cx q[4], q[7];
        cx q[5], q[9];
        
        // Perform per-node spider measurements.
        cx q[0], q[1];
        cx q[0], q[2];
        cx q[4], q[3];
        cx q[5], q[3];
        h q[0];
        h q[4];
        h q[5];
        measure q[0] -> m_0;
        measure q[1] -> m_1;
        measure q[2] -> m_2;
        measure q[3] -> m_3;
        measure q[4] -> m_4;
        measure q[5] -> m_5;
        
        // Adjust Pauli frame based on measurements.
        if (m_0 == 1) z q[8];
        if (m_1 == 1) x q[8];
        if (m_2 == 1) x q[9];
        if (m_3 == 1) x q[9];
        if (m_4 == 1) z q[8];
        if (m_4 == 1) z q[9];
        if (m_5 == 1) z q[9];
    `,
});

graphTestCase({
    name: 'cnot_with_spandrels',
    diagram: `
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
    `,
    stabilizers: [
        '+X.XX',
        '+Z.Z.',
        '+.X.X',
        '+.ZZZ',
    ],
    wavefunction: Matrix.fromRows([
        [0.5, 0, 0, 0],
        [0, 0, 0, 0.5],
        [0, 0, 0.5, 0],
        [0, 0.5, 0, 0],
    ]),
    gain: 8 * Math.sqrt(2),
});

graphTestCase({
    name: 'notc',
    diagram: `
        !---O---?
            |
            |
            |
        !---@---?
    `,
    stabilizers: [
        '+X.X.',
        '+Z.ZZ',
        '+.XXX',
        '+.Z.Z',
    ],
    wavefunction: Matrix.fromRows([
        [0.5, 0, 0, 0],
        [0, 0.5, 0, 0],
        [0, 0, 0, 0.5],
        [0, 0, 0.5, 0],
    ]),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'xor_swap',
    diagram: `
        !---@---O---@---?
            |   |   |
            |   |   |
            |   |   |
        !---O---@---O---?
    `,
    alternates: [`
        !---O---@---O---?
            |   |   |
            |   |   |
            |   |   |
        !---@---O---@---?
    `],
    stabilizers: [
        '+X..X',
        '+Z..Z',
        '+.XX.',
        '+.ZZ.',
    ],
    wavefunction: Matrix.fromRows([
        [0.5, 0, 0, 0],
        [0, 0, 0.5, 0],
        [0, 0.5, 0, 0],
        [0, 0, 0, 0.5],
    ]),
    gain: Math.sqrt(0.5),
});

graphTestCase({
    name: 'exchange_swap',
    diagram: `
        !-------+   +---?
                |   |
                |   |
                |   |
            +---+---+
            |   |
            |   |
            |   |
        !---+   +-------?
    `,
    alternates: [`
        !---+
            |
            |
            |
        !---+---?
            |
            |
            |
            +---?
    `],
    stabilizers: [
        '+X..X',
        '+Z..Z',
        '+.XX.',
        '+.ZZ.',
    ],
    wavefunction: Matrix.fromRows([
        [0.5, 0, 0, 0],
        [0, 0, 0.5, 0],
        [0, 0.5, 0, 0],
        [0, 0, 0, 0.5],
    ]),
    gain: 2,
});

graphTestCase({
    name: 'split',
    diagram: `
        !---@---?
            |
            |
            |
            @---?
    `,
    stabilizers: [
        '+XXX',
        '+Z.Z',
        '+.ZZ',
    ],
    wavefunction: Matrix.fromRows([
        [Math.sqrt(0.5), 0],
        [0, 0],
        [0, 0],
        [0, Math.sqrt(0.5)],
    ]),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'fuse',
    diagram: `
        !---@---?
            |
            |
            |
        !---@
    `,
    stabilizers: [
        '+XXX',
        '+Z.Z',
        '+.ZZ',
    ],
    wavefunction: Matrix.fromRows([
        [Math.sqrt(0.5), 0, 0, 0],
        [0, 0, 0, Math.sqrt(0.5)],
    ]),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'phaseFlip',
    diagram: `
        !-Z-?
    `,
    alternates: [`
        !---Z---?
    `, `
        !---@-Z-@---?
    `, `
        !---@---@---?
            |   |
            Z   Z
            |   |
            @-Z-@
    `, `
        !---@---@---?
            |   |
            |   |
            |   |
            @-Z-@
    `, `
        !---@-Z-@---?
            |   |
            |   |
            |   |
            @---@
    `],
    stabilizers: [
        '-XX',
        '+ZZ',
    ],
    wavefunction: Matrix.fromRows([
        [1, 0],
        [0, -1],
    ]).times(Math.sqrt(0.5)),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'bitFlip',
    diagram: `
        !-X-?
    `,
    alternates: [`
        !---X---?
    `, `
        !---@-X-@---?
    `, `
        !---O---O---?
            |   |
            |   |
            |   |
            O-X-O
    `],
    stabilizers: [
        '+XX',
        '-ZZ',
    ],
    wavefunction: Matrix.fromRows([
        [0, 1],
        [1, 0],
    ]).times(Math.sqrt(0.5)),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'hadamard',
    diagram: `
        !-H-?
    `,
    alternates: [`
        !---@-H-@---?
    `],
    stabilizers: [
        '+XZ',
        '+ZX',
    ],
    wavefunction: Matrix.fromRows([
        [1, 1],
        [1, -1],
    ]).times(0.5),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'flippedHadamard',
    diagram: `
        !-X-+-H-?
    `,
    alternates: [`
        !---X-H-?
    `],
    stabilizers: [
        '+XZ',
        '-ZX',
    ],
    wavefunction: Matrix.fromRows([
        [1, 1],
        [-1, 1],
    ]).times(0.5),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'phase',
    diagram: `
        !-S-?
    `,
    alternates: [`
        !---@-S-@---?
    `, `
        !---S---?
    `],
    stabilizers: [
        '+XY',
        '+ZZ',
    ],
    wavefunction: Matrix.fromRows([
        [1, 0],
        [0, Complex.I],
    ]).times(Math.sqrt(0.5)),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'phase',
    diagram: `
        !-F-?
    `,
    alternates: [`
        !---@-F-@---?
    `, `
        !---F---?
    `, `
        !-H-@-S-@-H-?
    `],
    stabilizers: [
        '+XX',
        '-ZY',
    ],
    wavefunction: Matrix.fromRows([
        [1, Complex.I.neg()],
        [Complex.I.neg(), 1],
    ]).times(0.5),
    gain: new Complex(1, 1),
});

graphTestCase({
    name: 's_distillation',
    diagram: `
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
    `,
    stabilizers: [
        '+Y',
    ],
    wavefunction: Matrix.fromRows([
        [1],
        [Complex.I],
    ]).times(Math.sqrt(0.5)),
    gain: new Complex(1, -1).times(Math.sqrt(0.25)),
});

graphTestCase({
    name: 'singleton',
    diagram: 'O',
    alternates: ['@'],
    stabilizers: [],
    wavefunction: Matrix.fromRows([[1]]),
    gain: 2,
});

graphTestCase({
    name: 'phasedIdentity',
    diagram: `
        !-H-@-F-@-S-@-F-?
    `,
    stabilizers: [
        '+XX',
        '+ZZ',
    ],
    wavefunction: Matrix.fromRows([
        [1, 0],
        [0, 1],
    ]).times(Math.sqrt(0.5)),
    gain: Complex.polar(Math.sqrt(2), Math.PI / 4),
});

graphTestCase({
    name: 'x_measure',
    diagram: `
        !---O---?
            |
            |
            |
            @
    `,
    stabilizers: [
        '+X.',
        '+.X',
    ],
    wavefunction: Matrix.fromRows([
        [1, 1],
        [1, 1],
    ]).times(0.5),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'z_measure',
    diagram: `
        !---@---?
            |
            |
            |
            O
    `,
    stabilizers: [
        '+Z.',
        '+.Z',
    ],
    wavefunction: Matrix.fromRows([
        [1, 0],
        [0, 0],
    ]),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'x_init',
    diagram: `
        @---?
    `,
    stabilizers: [
        '+X',
    ],
    wavefunction: Matrix.fromRows([
        [1],
        [1],
    ]).times(Math.sqrt(0.5)),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'z_init',
    diagram: `
        O---?
    `,
    stabilizers: [
        '+Z',
    ],
    wavefunction: Matrix.fromRows([
        [1],
        [0],
    ]),
    gain: Math.sqrt(2),
});

graphTestCase({
    name: 'doubleIdentity',
    diagram: `
        !---O---?



        !---O---?
    `,
    stabilizers: [
        '+X.X.',
        '+Z.Z.',
        '+.X.X',
        '+.Z.Z',
    ],
    tensor: Matrix.fromRows([
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
    ]),
    gain: 2,
});

graphTestCase({
    name: 'flipOne',
    diagram: `
        !---O-X-?



        !---O---?
    `,
    stabilizers: [
        '+X.X.',
        '-Z.Z.',
        '+.X.X',
        '+.Z.Z',
    ],
    tensor: Matrix.fromRows([
        [0, 1, 0, 0],
        [1, 0, 0, 0],
        [0, 0, 0, 1],
        [0, 0, 1, 0],
    ]),
    gain: 2,
});


// ====== REWRITE AXIOMS FROM https://arxiv.org/abs/1602.04744 ======
graphTestCase({
    name: 'axiom_B1',
    diagram: `
        @   @
        |   |
        |   |
        |   |
        ?   ?
    `,
    alternates: [`
        @       @
        |       |
        |       |
        |       |
        O   +---O---+
            |       |
            |       |
            |       |
            ?       ?
    `],
    tensor: Matrix.fromRows([
        [1],
        [1],
        [1],
        [1]
    ])
});
graphTestCase({
    name: 'axiom_B2',
    diagram: `
                !       !
                |       |
                |       |
                |       |
        O       @---+   |
        |       |   |   |
        |       |   |   |
        |       |   |   |
        @       O---+---@
                |   |   |
                |   |   |
                |   |   |
                |   +---O
                |       |
                |       |
                |       |
                ?       ?
    `,
    alternates: [`
        !       !
        |       |
        |       |
        |       |
        +---O---+
            |
            |
            |
        +---@---+
        |       |
        |       |
        |       |
        ?       ?
    `],
    tensor: Matrix.fromRows([
        [1, 0, 0, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 1, 1, 0],
    ]).times(Math.sqrt(0.5)),
});
graphTestCase({
    name: 'axiom_EU',
    diagram: `
        O   O   !
        |   |   |
        |   |   H
        |   |   |
        @   @   ?
    `,
    alternates: [`
        O
        |
        X
        |
        |       !
        |       |
        F       S
        |       |
        |       |
        |       |
        S       F
        |       |
        |       |
        |       |
        Z       S
        |       |
        @       ?
    `],
    tensor: Matrix.fromRows([
        [1, 1],
        [1, -1]
    ]).times(Math.sqrt(2)),
});
graphTestCase({
    name: 'axiom_ZO',
    diagram: `
        @   !
        |   |
        Z   |
        |   |
        @   ?
    `,
    alternates: [`
            !
            |
            |
            |
        @   @
        |
        Z
        |
        @   O
            |
            |
            |
            ?
    `],
    tensor: Matrix.fromRows([
        [0, 0],
        [0, 0]
    ]),
});
graphTestCase({
    name: 'axiom_K1',
    diagram: `
            !
            |
            Z
            |
        +---O---+
        |       |
        |       |
        |       |
        ?       ?
    `,
    alternates: [`
            !
            |
            |
            |
        +-Z-O-Z-+
        |       |
        |       |
        |       |
        ?       ?
    `],
    tensor: Matrix.fromRows([
        [1, 0],
        [0, -1],
        [0, -1],
        [1, 0],
    ]).times(Math.sqrt(0.5)),
});
graphTestCase({
    name: 'axiom_IV_prime',
    diagram: `
        @   +---O---+   +---O---+
            |   |   |   |   |   |
            |   |   |   |   |   |
            |   |   |   |   |   |
            +---@---+   +---@---+
    `,
    alternates: [``],
    tensor: Matrix.fromRows([
        [1],
    ]),
});
graphTestCase({
    name: 'axiom_EU_prime',
    diagram: `
        !
        |
        S
        |
        O---A
        |
        S
        |
        ?
    `,
    alternates: [`
        !
        |
        H
        |
        ?
    `],
    tensor: Matrix.fromRows([
        [1, 1],
        [1, -1]
    ]).times(Math.sqrt(0.5)),
});

// ====== Observed historical failure cases. ======
graphTestCase({
    name: 'observedFailure1',
    diagram: `
            !
            |
            |
            |
        ?---O---@
            |
            |
            |
        @---@
    `,
    stabilizers: [
        '+X.',
        '+.X',
    ],
    wavefunction: Matrix.fromRows([
        [0.5, 0.5],
        [0.5, 0.5],
    ]),
});
