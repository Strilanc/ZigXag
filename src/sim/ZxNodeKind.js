import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {Seq, seq} from "src/base/Seq.js";
import {PauliProduct} from "src/sim/PauliProduct.js";
import {Matrix} from "src/base/Matrix.js";
import {Complex} from "src/base/Complex.js";


class ZxNodeKind {
    /**
     * @param {!{
     *     id: !string,
     *     description: !string,
     *     contentDrawer: !function(ctx: !CanvasRenderingContext2D),
     *     diagramReps: (undefined|!Array.<!string>),
     *     hotkeys: !Array.<!string>,
     *     hotkeyShiftMask: (undefined|!boolean),
     *     mouseHotkey: (undefined|!string),
     *     allowedDegrees: !Array.<!int>,
     *     fixedPoints: !function(degree: !int): !Array.<!PauliProduct>,
     *     edgeAction: !{
     *         quirkGate: null|!string,
     *         qasmGates: null|!Array.<!string>,
     *         sim: !function(sim: !ChpSimulator, qubit: !int),
     *         matrix: null|!int|!Matrix,
     *     },
     * }} attributes
     */
    constructor(attributes) {
        this.id = attributes.id;
        this.description = attributes.description;
        this.contentDrawer = attributes.contentDrawer;
        this.diagramReps = attributes.diagramReps || [this.id];
        this.hotkeys = attributes.hotkeys;
        this.hotkeyShiftMask = attributes.hotkeyShiftMask;
        this.mouseHotkey = attributes.mouseHotkey;
        this.allowedDegrees = attributes.allowedDegrees;
        this.fixedPoints = attributes.fixedPoints;
        this.edgeAction = attributes.edgeAction;
    }
}

/**
 * @param {!string} stroke
 * @param {!string} fill
 * @param {!number} lineWidth
 * @returns {!function(ctx: !CanvasRenderingContext2D)},
 * @private
 */
function _nodeDrawer(stroke, fill, lineWidth) {
    return ctx => {
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, 2 * Math.PI);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
    };
}

/**
 * @param {!string} color
 * @returns {!function(ctx: !CanvasRenderingContext2D)},
 * @private
 */
function _piDrawer(color) {
    return ctx => {
        ctx.fillStyle = color;
        ctx.font = '12px monospace';
        ctx.fillText('π', -3, 3);
    }
}

/**
 * @param {!string} color
 * @returns {!function(ctx: !CanvasRenderingContext2D)},
 * @private
 */
function _halfPiDrawer(color) {
    return ctx => {
        ctx.fillStyle = color;
        ctx.font = '10px monospace';
        ctx.fillText('π', -3, -1);
        ctx.fillText('2', -3, 7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(4, 0);
        ctx.lineWidth = 1;
        ctx.strokeStyle = color;
        ctx.stroke();
    }
}

/**
 * @param {!string} color
 * @returns {!function(ctx: !CanvasRenderingContext2D)},
 * @private
 */
function _negHalfPiDrawer(color) {
    return ctx => {
        ctx.fillStyle = color;
        ctx.font = '10px monospace';
        ctx.fillText('-π', -5, -1);
        ctx.fillText('2', -3, 7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
        ctx.strokeStyle = color;
        ctx.stroke();
    }
}

/**
 * @param {!function(ctx: !CanvasRenderingContext2D)} drawers
 * @returns {!function(ctx: !CanvasRenderingContext2D)},
 * @private
 */
function _concatDrawers(...drawers) {
    return ctx => {
        for (let drawer of drawers) {
            drawer(ctx);
        }
    }
}

/**
 * @yields {!ZxNodeKind}
 */
function* _iterNodeKinds() {
    let noFixedPoints = deg => [];
    let noAction = {
        quirkGate: '…',
        qasmGates: [],
        sim: (sim, qubit) => {},
        matrix: 1,
    };
    let invalidAction = {
        quirkGate: null,
        qasmGates: null,
        sim: (sim, qubit) => { throw new Error('No valid edge action.'); },
        matrix: null,
    };

    for (let post of [false, true]) {
        for (let axis of [false, true]) {
            let nodeDraw = _nodeDrawer(
                post ? 'red' : 'black',
                axis ? 'black' : 'white',
                post ? 3 : 1);
            let textColor = axis ? 'white' : 'black';
            let axisPostChar = axis ? '+' : '0';
            let axisAntiPostChar = axis ? '-' : '1';
            let spider = axis ? 'Z' : 'X';
            let oppSpider = axis ? 'X' : 'Z';
            let desc = (selected, modifier, sign, gate) => {
                if (post) {
                    return `postselect\n|${selected}⟩`;
                }
                return [
                    `${spider} spider`,
                    modifier === '' ? [] : [`(${modifier})`],
                    '',
                    'Fixed measures:',
                    `∀k: ${spider}0·${spider}k`,
                    `${sign}Πk(${oppSpider}k)`,
                    '',
                    'Action:',
                    gate
                ].join('\n');
            };

            let spiderFixedPoints = rootY => {
                if (post) {
                    return noFixedPoints;
                }
                return deg => {
                    if (deg === 0) {
                        return [];
                    }

                    let globalParity = new PauliProduct(0, new Uint8Array(deg));
                    for (let i = 0; i < deg; i++) {
                        globalParity.paulis[i] = axis ? 1 : 2;
                    }
                    if (rootY) {
                        globalParity.paulis[0] = 3;
                    }

                    let result = [];
                    result.push(globalParity);
                    for (let i = 1; i < deg; i++) {
                        result.push(PauliProduct.fromXzParity(deg, axis, [0, i]));
                    }
                    return result;
                };
            };

            yield new ZxNodeKind({
                id: `${axis ? '@' : 'O'}${post ? '!' : ''}`,
                description: desc(axisPostChar, '', '', 'Identity'),
                diagramReps: (axis ? ['@'] : ['O', 'o', '0']).map(e => post ? e + '!' : e),
                contentDrawer: nodeDraw,
                hotkeys: post
                    ? (axis ? ['@'] : ['O', ')'])
                    : (axis ? ['2'] : ['o', '0']),
                hotkeyShiftMask: post,
                mouseHotkey: undefined,
                allowedDegrees: post ? [1] : [0, 1, 2, 3, 4],
                fixedPoints: spiderFixedPoints(false),
                edgeAction: noAction,
            });

            yield new ZxNodeKind({
                id: `${axis ? 'z' : 'x'}${post ? '!' : ''}`,
                description: desc(axisAntiPostChar, 'Flipped', '-', spider),
                diagramReps: (axis ? ['Z', 'z'] : ['X', 'x']).map(e => post ? e + '!' : e),
                contentDrawer: _concatDrawers(nodeDraw, _piDrawer(textColor)),
                hotkeys: post
                    ? (axis ? ['Z'] : ['X'])
                    : (axis ? ['z'] : ['x']),
                hotkeyShiftMask: post,
                mouseHotkey: undefined,
                allowedDegrees: post ? [1] : [0, 1, 2, 3, 4],
                fixedPoints: spiderFixedPoints(false),
                edgeAction: post ? invalidAction : {
                    quirkGate: axis ? 'Z' : 'X',
                    qasmGates: axis ? ['z'] : ['x'],
                    sim: (sim, qubit) => {
                        if (axis) {
                            sim.phase(qubit);
                            sim.phase(qubit);
                        } else {
                            sim.hadamard(qubit);
                            sim.phase(qubit);
                            sim.phase(qubit);
                            sim.hadamard(qubit);
                        }
                    },
                    matrix: axis ? Matrix.square(1, 0, 0, -1) : Matrix.square(0, 1, 1, 0),
                },
            });

            yield new ZxNodeKind({
                id: `${axis ? 's' : 'f'}${post ? '!' : ''}`,
                description: desc(axis ? 'i' : '-i', 'Phased', `-i${spider}0·`, axis ? 'S' : 'H·S·H'),
                diagramReps: (axis ? ['S', 's'] : ['F', 'f']).map(e => post ? e + '!' : e),
                contentDrawer: _concatDrawers(nodeDraw, _halfPiDrawer(textColor)),
                hotkeys: post
                    ? (axis ? ['S'] : ['V'])
                    : (axis ? ['s'] : ['v']),
                hotkeyShiftMask: post,
                mouseHotkey: undefined,
                allowedDegrees: post ? [1] : [0, 1, 2, 3, 4],
                fixedPoints: spiderFixedPoints(true),
                edgeAction: post ? invalidAction : {
                    quirkGate: axis ? 'Z^½' : 'X^½',
                    qasmGates: axis ? ['s'] : ['h', 's', 'h'],
                    sim: (sim, qubit) => {
                        if (axis) {
                            sim.phase(qubit);
                        } else {
                            sim.hadamard(qubit);
                            sim.phase(qubit);
                            sim.hadamard(qubit);
                        }
                    },
                    matrix: axis ?
                        Matrix.square(1, 0, 0, Complex.I) :
                        Matrix.square(1, Complex.I.neg(), Complex.I.neg(), 1).times(new Complex(0.5, 0.5)),
                },
            });

            yield new ZxNodeKind({
                id: `${axis ? 'a' : 'w'}${post ? '!' : ''}`,
                description: desc(axis ? '-i' : 'i', 'Backphased', `i${spider}0·`, axis ? 'S†' : 'H·S†·H'),
                diagramReps: (axis ? ['A', 'a'] : ['W', 'w']).map(e => post ? e + '!' : e),
                contentDrawer: _concatDrawers(nodeDraw, _negHalfPiDrawer(textColor)),
                hotkeys: post
                    ? (axis ? ['A'] : ['W'])
                    : (axis ? ['a'] : ['w']),
                hotkeyShiftMask: post,
                mouseHotkey: undefined,
                allowedDegrees: post ? [1] : [0, 1, 2, 3, 4],
                fixedPoints: spiderFixedPoints(true),
                edgeAction: post ? invalidAction : {
                    quirkGate: axis ? 'Z^-½' : 'X^-½',
                    qasmGates: axis ? ['z', 's'] : ['x', 'h', 's', 'h'],
                    sim: (sim, qubit) => {
                        if (axis) {
                            sim.phase(qubit);
                            sim.phase(qubit);
                            sim.phase(qubit);
                        } else {
                            sim.hadamard(qubit);
                            sim.phase(qubit);
                            sim.phase(qubit);
                            sim.phase(qubit);
                            sim.hadamard(qubit);
                        }
                    },
                    matrix: axis ?
                        Matrix.square(1, 0, 0, Complex.I.neg()) :
                        Matrix.square(1, Complex.I, Complex.I, 1).times(new Complex(0.5, -0.5)),
                },
            });
        }
    }

    yield new ZxNodeKind({
        id: '+',
        description: 'Crosser node',
        diagramReps: ['+', '-', '|'],
        contentDrawer: ctx => {
            // Empty space.
        },
        hotkeys: [],
        hotkeyShiftMask: undefined,
        mouseHotkey: undefined,
        allowedDegrees: [2, 4],
        fixedPoints: deg => {
            if (deg === 4) {
                return [
                    // HACK: This implicitly depends on the sorting order of edges being [left, top, down, right].
                    PauliProduct.fromString('X..X'),
                    PauliProduct.fromString('Z..Z'),
                    PauliProduct.fromString('.XX.'),
                    PauliProduct.fromString('.ZZ.'),
                ];
            }

            if (deg === 2) {
                return [PauliProduct.fromString('XX'), PauliProduct.fromString('ZZ')];
            }

            throw new Error('Invalid degree.');
        },
        edgeAction: noAction,
    });

    yield new ZxNodeKind({
        id: 'h',
        description: 'Hadamard\n\nSelection:\nX0·Z1\nZ0·X1\n\nAction:\nH',
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
    });

    yield new ZxNodeKind({
        id: 'in',
        description: 'Input node',
        diagramReps: ['!'],
        contentDrawer: ctx => {
            _nodeDrawer('black', 'yellow', 1)(ctx);
            ctx.fillStyle = 'black';
            ctx.font = '12px monospace';
            ctx.fillText('in', -7, +2);
        },
        hotkeys: ['i', 'I'],
        hotkeyShiftMask: undefined,
        mouseHotkey: undefined,
        allowedDegrees: [1],
        fixedPoints: noFixedPoints,
        edgeAction: invalidAction,
    });

    yield new ZxNodeKind({
        id: 'out',
        description: 'Output node',
        diagramReps: ['?'],
        contentDrawer: ctx => {
            _nodeDrawer('black', 'yellow', 1)(ctx);
            ctx.fillStyle = 'black';
            ctx.font = '12px monospace';
            ctx.fillText('out', -9, 2);
        },
        hotkeys: ['u', 'U'],
        hotkeyShiftMask: undefined,
        mouseHotkey: undefined,
        allowedDegrees: [1],
        fixedPoints: noFixedPoints,
        edgeAction: invalidAction,
    });
}

let map = /** @type {!GeneralMap.<!string, !ZxNodeKind>} */ new GeneralMap();
for (let e of _iterNodeKinds()) {
    map.set(e.id, e);
}
const NODES = {
    map: map,
    all: [...map.values()],
    cross: map.get('+'),
    x: map.get('O'),
    z: map.get('@'),
    white: map.get('O'),
    black: map.get('@'),
    h: map.get('h'),
};

export {ZxNodeKind, NODES}
