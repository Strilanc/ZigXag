import {Painter} from "src/Painter.js";
import {Rect} from "src/base/Rect.js";
import {Point} from "src/base/Point.js";
import {NODES} from "src/nodes/All.js";

class RingMenuEntry {
    /**
     * @param {!string} id
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
    constructor(id,
                description,
                contentDrawer,
                centerAngle,
                centerRadius,
                angleSpan,
                radiusSpan,
                hotkeys,
                shiftMask,
                mouseHotkey=undefined) {
        this.id = id;
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
     * @param {!ZxNodeKind} nodeKind
     * @param {!number} centerAngle
     * @param {!number} centerRadius
     * @param {!number} angleSpan
     * @param {!number} radiusSpan
     * @returns {!RingMenuEntry}
     */
    static fromNodeKind(nodeKind,
                        centerAngle,
                        centerRadius,
                        angleSpan,
                        radiusSpan) {
        return new RingMenuEntry(
            nodeKind.id,
            nodeKind.description,
            nodeKind.contentDrawer,
            centerAngle,
            centerRadius,
            angleSpan,
            radiusSpan,
            nodeKind.hotkeys,
            nodeKind.hotkeyShiftMask,
            nodeKind.mouseHotkey);
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


class RingMenu {
    /**
     * @param {!Array.<!RingMenuEntry>} entries
     */
    constructor(entries = []) {
        this.entries = entries;
    }

    /**
     * @param {!int} keyCode
     * @param {!boolean} shiftKey
     * @returns {undefined|!RingMenuEntry}
     */
    entryForKey(keyCode, shiftKey) {
        let keyChar = String.fromCharCode(keyCode).toLowerCase();
        for (let entry of this.entries) {
            if (entry.shiftMask === undefined || shiftKey === entry.shiftMask) {
                for (let hotkey of entry.hotkeys) {
                    if (hotkey === keyCode || (typeof hotkey === 'string' && hotkey.toLowerCase() === keyChar)) {
                        return entry;
                    }
                }
            }
        }
        return undefined;
    }

    /**
     * @param {!number} cx
     * @param {!number} cy
     * @param {!number} x
     * @param {!number} y
     * @returns {!RingMenuEntry|!undefined}
     */
    entryAt(cx, cy, x, y) {
        if (x === undefined || y === undefined) {
            return undefined;
        }
        for (let entry of this.entries) {
            if (entry.contains(x - cx, y - cy)) {
                return entry;
            }
        }
        return undefined;
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

        let focused = this.entryAt(cx, cy, mouseX, mouseY);
        if (focused !== undefined) {
            focused.draw(ctx, cx, cy, 2);
            ctx.fillStyle = 'white';
            ctx.fillRect(cx - 40, cy - 40, 80, 80);
            new Painter(ctx).printParagraph(
                focused.description,
                new Rect(cx - 75, cy - 75, 150, 150),
                new Point(0.5, 0.5),
                'black',
                12,
                'monospace');
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
            let angleWidth = Math.PI / 8;
            let startAngle = axis ? angleWidth * -6.5 : -angleWidth * 1.5;
            let step = Math.PI / 8 * (axis ? -1 : 1);
            let radius = baseRadius + (post ? radiusStep : 0);

            result.entries.push(RingMenuEntry.fromNodeKind(
                NODES.map.get(`${axis ? '@' : 'O'}${post ? '!' : ''}`),
                startAngle,
                radius,
                angleWidth,
                radiusStep));
            result.entries.push(RingMenuEntry.fromNodeKind(
                NODES.map.get(`${axis ? 'z' : 'x'}${post ? '!' : ''}`),
                startAngle + step,
                radius,
                angleWidth,
                radiusStep));
            result.entries.push(RingMenuEntry.fromNodeKind(
                NODES.map.get(`${axis ? 's' : 'f'}${post ? '!' : ''}`),
                startAngle + 2 * step,
                radius,
                angleWidth,
                radiusStep));
            result.entries.push(RingMenuEntry.fromNodeKind(
                NODES.map.get(`${axis ? 'a' : 'w'}${post ? '!' : ''}`),
                startAngle + 3 * step,
                radius,
                angleWidth,
                radiusStep));
        }
    }

    result.entries.push(new RingMenuEntry(
        'del',
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
        'edge',
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

    result.entries.push(RingMenuEntry.fromNodeKind(
        NODES.h,
        -Math.PI / 2,
        baseRadius + radiusStep / 2,
        Math.PI / 8,
        radiusStep));

    result.entries.push(RingMenuEntry.fromNodeKind(
        NODES.in,
        -Math.PI / 2 - Math.PI / 8 * 1.1,
        baseRadius + radiusStep / 2,
        Math.PI / 8,
        radiusStep));

    result.entries.push(RingMenuEntry.fromNodeKind(
        NODES.out,
        -Math.PI / 2 + Math.PI / 8 * 1.1,
        baseRadius + radiusStep / 2,
        Math.PI / 8,
        radiusStep));

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
