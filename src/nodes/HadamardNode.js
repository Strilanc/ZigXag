import {QubitAxis, PauliProduct} from "src/sim/PauliProduct.js";
import {Matrix} from "src/base/Matrix.js";
import {MultiCnot} from "src/sim/QuantumProgram.js";
import {ZxNodeKind, TransformedMeasurement} from "src/nodes/ZxNodeKind.js"
import {
    NO_EDGE_ACTION,
} from "src/nodes/Base.js";

const HADAMARD_NODE = new ZxNodeKind({
    id: 'h',
    description: 'Hadamard\n\nFixed measures:\nX0·Z1\nZ0·X1\n\nAction:\nH',
    diagramReps: ['H', 'h'],
    contentDrawer: ctx => {
        ctx.fillStyle = 'yellow';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.fillRect(-5, -5, 10, 10);
        ctx.strokeRect(-5, -5, 10, 10);
    },
    hotkeys: ['h', 'H'],
    hotkeyShiftMask: undefined,
    mouseHotkey: undefined,
    allowedDegrees: [2],
    fixedPoints: deg => {
        if (deg !== 2) {
            throw new Error('Invalid degree.');
        }
        return [PauliProduct.fromString('XZ'), PauliProduct.fromString('ZX')];
    },
    edgeAction: {
        quirkGate: 'H',
        qasmGates: ['h'],
        sim: (sim, qubit) => {
            sim.hadamard(qubit);
        },
        matrix: Matrix.square(1, 1, 1, -1).times(Math.sqrt(0.5)),
    },
    nodeRootEdgeAction: NO_EDGE_ACTION,
    tensor: dim => {
        if (dim !== 2) {
            throw new Error(`Bad Hadamard dimension: ${dim}`);
        }
        return Matrix.square(1, 1, 1, -1).times(Math.sqrt(0.5));
    },
    nodeMeasurer: (outProgram, totalQubits, qubitIds) => {
        let [a, b] = qubitIds;
        outProgram.statements.push(new MultiCnot(a, [b], true, true));
        return [
            new TransformedMeasurement(
                PauliProduct.fromSparseByType(totalQubits, {X: a, Z: b}),
                new QubitAxis(a, false),
                new QubitAxis(b, false)),
            new TransformedMeasurement(
                PauliProduct.fromSparseByType(totalQubits, {X: b, Z: a}),
                new QubitAxis(b, false),
                new QubitAxis(a, false))
        ];
    },
});

export {HADAMARD_NODE}
