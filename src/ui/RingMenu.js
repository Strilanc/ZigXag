import {Painter} from "src/Painter.js";
import {Rect} from "src/base/Rect.js";
import {Point} from "src/base/Point.js";

class RingMenuEntry {
    /**
     * @param {!string} description
     * @param {!function(ctx: !CanvasRenderingContext2D, x: !number, y: !number, r: !number)} contentDrawer
     * @param {!number} centerAngle
     * @param {!number} centerRadius
     * @param {!number} angleSpan
     * @param {!number} radiusSpan
     * @param {!Array.<!string>} hotkeys
     * @param {undefined|!boolean} shiftMask
     * @param {undefined|!string} mouseHotkey
     */
    constructor(description,
                contentDrawer,
                centerAngle,
                centerRadius,
                angleSpan,
                radiusSpan,
                hotkeys,
                shiftMask,
                mouseHotkey=undefined) {
        this.description = description;
        this.contentDrawer = contentDrawer;
        this.centerAngle = centerAngle;
        this.centerRadius = centerRadius;
        this.angleSpan = angleSpan;
        this.radiusSpan = radiusSpan;
        this.hotkeys = hotkeys;
        this.shiftMask = shiftMask;
        this.mouseHotkey = mouseHotkey;
    }

    /**
     * @param {!number} dx
     * @param {!number} dy
     */
    contains(dx, dy) {
        let angle = Math.atan2(dy, dx);
        let angleDif = normalizedSignedAngle(angle - this.centerAngle);
        if (Math.abs(angleDif) > this.angleSpan / 2) {
            return false;
        }
        let radius = Math.sqrt(dx * dx + dy * dy);
        return Math.abs(radius - this.centerRadius) <= this.radiusSpan / 2;
    }

    /**
     * @param {!CanvasRenderingContext2D} ctx
     * @param {!number} cx
     * @param {!number} cy
     * @param {!int} focusLevel
     */
    draw(ctx, cx, cy, focusLevel) {
        let r0 = this.centerRadius - this.radiusSpan / 2;
        let r1 = this.centerRadius + this.radiusSpan / 2;
        let a0 = this.centerAngle - this.angleSpan / 2;
        let a1 = this.centerAngle + this.angleSpan / 2;

        ctx.save();
        try {
            ctx.translate(cx, cy);
            ctx.save();
            ctx.fillStyle = 'black';
            ctx.font = '20px monospace';
            ctx.rotate(this.centerAngle);
            if (this.shiftMask !== true) {
                ctx.translate(r0 - 10, 0);
            } else {
                ctx.translate(r1 + 10, 0);
            }
            ctx.rotate(-this.centerAngle);
            ctx.rotate(normalizedQuarterAngleOffset(this.centerAngle));
            ctx.fillText(this.hotkeys[0], -this.hotkeys[0].length * 5, 6);
            ctx.restore();

            if (this.mouseHotkey !== undefined) {
                ctx.lineWidth = 1;

                ctx.save();
                ctx.fillStyle = 'black';
                ctx.font = '16px monospace';
                ctx.rotate(this.centerAngle);
                ctx.translate(r1 + 10, 0);
                ctx.rotate(-this.centerAngle);
                ctx.rotate(normalizedQuarterAngleOffset(this.centerAngle));
                ctx.strokeStyle = 'black';

                let terms = this.mouseHotkey.split('+');
                if (terms.length > 1) {
                    ctx.fillText(terms[0] + '+', -terms[0].length * 6 - 6, 6);
                    ctx.translate(terms[0].length * 6, 0);
                }
                if (this.mouseHotkey.indexOf('middle') !== -1) {
                    ctx.beginPath();
                    ctx.moveTo(-2, 4);
                    ctx.lineTo(2, 4);
                    ctx.lineTo(2, -7);
                    ctx.lineTo(-2, -7);
                    ctx.lineTo(-2, 4);
                    ctx.fillStyle = 'red';
                    ctx.fill();
                }
                if (this.mouseHotkey.indexOf('left') !== -1) {
                    ctx.beginPath();
                    ctx.moveTo(-2, 4);
                    ctx.lineTo(-7, 4);
                    ctx.lineTo(-7, -3);
                    ctx.lineTo(-2, -7);
                    ctx.lineTo(-2, 4);
                    ctx.fillStyle = 'red';
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(0, 0, 7, 0, Math.PI, true);
                ctx.lineTo(-7, 10);
                ctx.arc(0, 10, 7, Math.PI, 0, true);
                ctx.lineTo(7, 0);
                ctx.moveTo(7, 4);
                ctx.lineTo(-7, 4);
                ctx.moveTo(2, 4);
                ctx.lineTo(2, -7);
                ctx.moveTo(-2, 4);
                ctx.lineTo(-2, -7);
                ctx.stroke();
                ctx.restore();
            }

            if (focusLevel === 2) {
                r0 -= 8;
                r1 += 8;
                a0 -= 0.01;
                a1 += 0.01;
            }
            ctx.strokeStyle = 'black';
            ctx.fillStyle = focusLevel === 0 ? '#DDD' : focusLevel === 1 ? '#EED' : '#FF8';
            ctx.lineWidth = focusLevel === 2 ? 5 : 2;
            ctx.beginPath();
            ctx.arc(0, 0, r0, this.centerAngle, a1);
            ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
            ctx.arc(0, 0, r1, a1, a0, true);
            ctx.lineTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
            ctx.arc(0, 0, r0, a0, this.centerAngle);
            ctx.stroke();
            ctx.fill();
        } finally {
            ctx.restore();
        }

        ctx.save();
        try {
            ctx.translate(cx, cy);
            ctx.rotate(this.centerAngle);
            ctx.translate((r0 + r1) / 2, 0);
            ctx.rotate(-this.centerAngle);
            ctx.rotate(normalizedQuarterAngleOffset(this.centerAngle));
            this.contentDrawer(ctx, 0, 0);
        } finally {
            ctx.restore();
        }
    }
}

function _nodeDrawer(stroke, fill) {
    return (ctx, x, y) => {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, 2 * Math.PI);
        ctx.lineWidth = 4;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;
        ctx.stroke();
        ctx.fill();
    };
}

function _piDrawer(color) {
    return (ctx, x, y) => {
        ctx.fillStyle = color;
        ctx.font = '12px monospace';
        ctx.fillText('π', x - 3, y + 3);
    }
}

function _halfPiDrawer(color) {
    return (ctx, x, y) => {
        ctx.fillStyle = color;
        ctx.font = '10px monospace';
        ctx.fillText('π', x - 3, y - 1);
        ctx.fillText('2', x - 3, y + 7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.lineTo(x + 4, y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = color;
        ctx.stroke();
    }
}

function _negHalfPiDrawer(color) {
    return (ctx, x, y) => {
        ctx.fillStyle = color;
        ctx.font = '10px monospace';
        ctx.fillText('-π', x - 5, y - 1);
        ctx.fillText('2', x - 3, y + 7);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.strokeStyle = color;
        ctx.stroke();
    }
}

function _concatDrawers(...a) {
    return (ctx, x, y) => {
        for (let e of a) {
            e(ctx, x, y);
        }
    }
}

class RingMenu {
    /**
     * @param {!Array.<!RingMenuEntry>} entries
     */
    constructor(entries = []) {
        this.entries = entries;
    }

    /**
     * @param {!CanvasRenderingContext2D} ctx
     * @param {!number} cx
     * @param {!number} cy
     * @param {!boolean} altPressed
     * @param {undefined|!number} mouseX
     * @param {undefined|!number} mouseY
     */
    draw(ctx, cx, cy, altPressed, mouseX, mouseY) {
        ctx.save();
        try {
            ctx.translate(cx, cy);
            ctx.fillStyle = 'black';
            ctx.font = '12px monospace';
            for (let entry of this.entries) {
                if (entry.shiftMask === true) {
                    let a1 = normalizedSignedAngle(entry.centerAngle - entry.angleSpan / 2 - Math.PI * 0.01);
                    let a2 = normalizedSignedAngle(entry.centerAngle + entry.angleSpan / 2 + Math.PI * 0.025);
                    for (let a of [a1, a2]) {
                        ctx.save();
                        ctx.rotate(a);
                        ctx.translate(entry.centerRadius + entry.radiusSpan/2 - 10, 0);
                        if (Math.abs(a) > Math.PI/2) {
                            ctx.rotate(Math.PI);
                            ctx.translate(10, 8);
                        }
                        ctx.fillText('shift', -22, 0);
                        ctx.restore();
                    }
                }
            }
        } finally {
            ctx.restore();
        }

        for (let entry of this.entries) {
            entry.draw(ctx, cx, cy, entry.shiftMask === altPressed ? 1 : 0);
        }

        if (mouseX !== undefined && mouseY !== undefined) {
            for (let entry of this.entries) {
                if (entry.contains(mouseX - cx, mouseY - cy)) {
                    entry.draw(ctx, cx, cy, 2);
                    ctx.fillStyle = 'white';
                    ctx.fillRect(cx - 40, cy - 40, 80, 80);
                    new Painter(ctx).printParagraph(
                        entry.description,
                        new Rect(cx - 75, cy - 75, 150, 150),
                        new Point(0.5, 0.5),
                        'black',
                        12,
                        'monospace');
                }
            }
        }
    }
}

/**
 * @returns {!RingMenu}
 */
function makeNodeRingMenu() {
    let result = new RingMenu();

    let radiusStep = 35;
    let baseRadius = 100;
    for (let post of [false, true]) {
        for (let axis of [false, true]) {
            let nodeDraw = _nodeDrawer(
                post ? 'red' : 'black',
                axis ? 'white' : 'black');
            let textColor = axis ? 'black' : 'white';
            let angleWidth = Math.PI / 8;
            let startAngle = axis ? angleWidth * -6.5 : -angleWidth * 1.5;
            let step = Math.PI / 8 * (axis ? -1 : 1);
            let radius = baseRadius + (post ? radiusStep : 0);
            let axisPostChar = axis ? '0' : '+';
            let axisAntiPostChar = axis ? '1' : '-';
            let spider = axis ? 'X' : 'Z';
            let oppSpider = axis ? 'Z' : 'X';
            let desc = (selected, modifier, sign, gate) => {
                if (post) {
                    return `postselect\n|${selected}⟩`;
                }
                return [
                    `${spider} spider`,
                    ...[modifier === '' ? [] : [`(${modifier})`]],
                    '',
                    'Selection:',
                    `∀k: ${spider}0·${spider}k`,
                    `${sign}Πk(${oppSpider}k)`,
                    '',
                    'Action:',
                    gate
                ].join('\n');
            };

            result.entries.push(new RingMenuEntry(
                desc(axisPostChar, '', '', 'Identity'),
                nodeDraw,
                startAngle,
                radius,
                angleWidth,
                radiusStep,
                post
                    ? (axis ? ['O', '!'] : ['@'])
                    : (axis ? ['o', '0'] : ['2']),
                post));
            result.entries.push(new RingMenuEntry(
                desc(axisAntiPostChar, 'Flipped', '-', spider),
                _concatDrawers(nodeDraw, _piDrawer(textColor)),
                startAngle + step,
                radius,
                angleWidth,
                radiusStep,
                post
                    ? (axis ? ['X'] : ['Z'])
                    : (axis ? ['x'] : ['z']),
                post));
            result.entries.push(new RingMenuEntry(
                desc(axis ? '-i' : 'i', 'Phased', `-i${spider}0·`, axis ? 'H·S·H' : 'S'),
                _concatDrawers(nodeDraw, _halfPiDrawer(textColor)),
                startAngle + 2 * step,
                radius,
                angleWidth,
                radiusStep,
                post
                    ? (axis ? ['V'] : ['S'])
                    : (axis ? ['v'] : ['s']),
                post));
            result.entries.push(new RingMenuEntry(
                desc(axis ? 'i' : '-i', 'Backphased', `i${spider}0·`, axis ? 'H·S†·H' : 'S†'),
                _concatDrawers(nodeDraw, _negHalfPiDrawer(textColor)),
                startAngle + 3 * step,
                radius,
                angleWidth,
                radiusStep,
                post
                    ? (axis ? ['W'] : ['A'])
                    : (axis ? ['w'] : ['a']),
                post));
        }
    }

    result.entries.push(new RingMenuEntry(
        'Delete node',
        (ctx, x, y) => {
            ctx.fillStyle = 'red';
            ctx.font = '20px monospace';
            ctx.fillText('DEL', x - 15, y + 5);
        },
        Math.PI / 2 - Math.PI / 16 * 1.2,
        baseRadius + radiusStep / 2,
        Math.PI / 8,
        radiusStep,
        ['del'],
        undefined,
        'middle'));

    result.entries.push(new RingMenuEntry(
        'Start edge',
        (ctx, x, y) => {
            ctx.fillStyle = 'black';
            ctx.font = '18px monospace';
            ctx.fillText('edge', x - 20, y + 5);
        },
        Math.PI / 2 + Math.PI / 16 * 1.2,
        baseRadius + radiusStep / 2,
        Math.PI / 8,
        radiusStep,
        ['e'],
        undefined,
        'ctrl+left'));

    result.entries.push(new RingMenuEntry(
        'Hadamard\n\nSelection:\nX0·Z1\nZ0·X1\n\nAction:\nH',
        (ctx, x, y) => {
            ctx.fillStyle = 'yellow';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.fillRect(x - 5, y - 5, 10, 10);
            ctx.strokeRect(x - 5, y - 5, 10, 10);
        },
        -Math.PI / 2,
        baseRadius + radiusStep / 2,
        Math.PI / 8,
        radiusStep,
        ['h'],
        undefined));

    result.entries.push(new RingMenuEntry(
        'Input node',
        (ctx, x, y) => {
            _nodeDrawer('black', 'yellow')(ctx, x, y);
            ctx.fillStyle = 'black';
            ctx.font = '12px monospace';
            ctx.fillText('in', x - 7, y+2);
        },
        -Math.PI / 2 - Math.PI / 8 * 1.1,
        baseRadius + radiusStep / 2,
        Math.PI / 8,
        radiusStep,
        ['i'],
        undefined));

    result.entries.push(new RingMenuEntry(
        'Output node',
        (ctx, x, y) => {
            _nodeDrawer('black', 'yellow')(ctx, x, y);
            ctx.fillStyle = 'black';
            ctx.font = '12px monospace';
            ctx.fillText('out', x - 9, y+2);
        },
        -Math.PI / 2 + Math.PI / 8 * 1.1,
        baseRadius + radiusStep / 2,
        Math.PI / 8,
        radiusStep,
        ['u'],
        undefined));

    return result;
}

/**
 * @param {!number} angle
 * @returns {!number}
 */
function normalizedSignedAngle(angle) {
    angle %= 2 * Math.PI;
    angle += 2 * Math.PI;
    angle %= 2 * Math.PI;
    if (angle >= Math.PI) {
        angle -= 2 * Math.PI;
    }
    return angle;
}

/**
 * @param {!number} angle
 * @returns {!number}
 */
function normalizedQuarterAngleOffset(angle) {
    angle %= Math.PI / 2;
    while (angle >= Math.PI/4) {
        angle -= Math.PI/2;
    }
    while (angle < -Math.PI/4) {
        angle += Math.PI/2;
    }
    return angle;
}

export {RingMenu, RingMenuEntry, makeNodeRingMenu}
