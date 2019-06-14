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

import {Painter} from "src/Painter.js"
import {Rect} from "src/base/Rect.js"
import {Matrix} from "src/base/Matrix.js"
import {Config} from "src/Config.js"

class MathPainter {
    /**
     * @param {!Tracer} trace
     * @param {!number} real
     * @param {!number} imag
     * @param {!number} x
     * @param {!number} y
     * @param {!number} d
     * @private
     */
    static _traceAmplitudeProbabilitySquare(trace, real, imag, x, y, d) {
        let p = real*real + imag*imag;
        if (p > 0.001) {
            trace.polygon([
                x, y + d * (1 - p),
                x + d, y + d * (1 - p),
                x + d, y + d,
                x, y + d]);
        }
    }

    /**
     * @param {!Tracer} trace
     * @param {!number} real
     * @param {!number} imag
     * @param {!number} x
     * @param {!number} y
     * @param {!number} d
     * @private
     */
    static _traceAmplitudeProbabilityCircle(trace, real, imag, x, y, d) {
        let mag = Math.sqrt(real*real + imag*imag);
        if (d*mag > 0.5) {
            trace.circle(x+d/2, y+d/2, mag*d/2);
        }
    }

    /**
     * @param {!Tracer} trace
     * @param {!number} real
     * @param {!number} imag
     * @param {!number} x
     * @param {!number} y
     * @param {!number} d
     * @private
     */
    static _traceAmplitudeLogarithmCircle(trace, real, imag, x, y, d) {
        let g = 1 + Math.log(real*real + imag*imag)/15;
        if (g > 0) {
            trace.circle(x+d/2, y+d/2, g*d/2);
        }
    }

    /**
     * @param {!Tracer} trace
     * @param {!number} real
     * @param {!number} imag
     * @param {!number} x
     * @param {!number} y
     * @param {!number} d
     * @private
     */
    static _traceAmplitudePhaseDirection(trace, real, imag, x, y, d) {
        let mag = Math.sqrt(real*real + imag*imag);
        let g = 1 + Math.log(mag)/10;
        let r = Math.max(1, g/mag)*Math.max(d/2, 5);
        if (r < 0.1) {
            return;
        }
        let cx = x + d/2;
        let cy = y + d/2;
        trace.line(cx, cy, cx + real*r, cy - imag*r);
    }

    /**
     * Draws a visual representation of a complex matrix.
     * @param {!Painter} painter
     * @param {!Matrix} matrix The matrix to draw.
     * @param {!Rect} drawArea The rectangle to draw the matrix within.
     * @param {undefined|!string} amplitudeCircleFillColor
     * @param {!string} amplitudeCircleStrokeColor
     * @param {undefined|!string} amplitudeProbabilityFillColor
     * @param {undefined|!string=} backColor
     * @param {undefined|!string=} amplitudePhaseStrokeColor
     * @param {undefined|!string=} logCircleStrokeColor
     */
    static paintMatrix(painter,
                       matrix,
                       drawArea,
                       amplitudeCircleFillColor=Config.SUPERPOSITION_MID_COLOR,
                       amplitudeCircleStrokeColor='black',
                       amplitudeProbabilityFillColor=Config.SUPERPOSITION_FORE_COLOR,
                       backColor = Config.SUPERPOSITION_BACK_COLOR,
                       amplitudePhaseStrokeColor = undefined,
                       logCircleStrokeColor = '#AAA') {
        let numCols = matrix.width();
        let numRows = matrix.height();
        let buf = matrix.rawBuffer();
        let diam = Math.min(drawArea.w / numCols, drawArea.h / numRows);
        drawArea = drawArea.withW(diam * numCols).withH(diam*numRows);
        let {x, y} = drawArea;
        let hasNaN = matrix.hasNaN();
        amplitudePhaseStrokeColor = amplitudePhaseStrokeColor || amplitudeCircleStrokeColor;

        painter.fillRect(drawArea, backColor);

        let traceCellsWith = cellTraceFunc => painter.trace(trace => {
            for (let row = 0; row < numRows; row++) {
                for (let col = 0; col < numCols; col++) {
                    let k = (row * numCols + col) * 2;
                    cellTraceFunc(
                        trace,
                        buf[k],
                        buf[k + 1],
                        x + diam * col,
                        y + diam * row,
                        diam);
                }
            }
        });

        if (!hasNaN) {
            // Squared magnitude levels.
            if (amplitudeProbabilityFillColor !== undefined) {
                traceCellsWith(MathPainter._traceAmplitudeProbabilitySquare).
                thenFill(amplitudeProbabilityFillColor).
                thenStroke('lightgray', 0.5);
            }

            // Circles.
            if (amplitudeCircleFillColor !== undefined) {
                traceCellsWith(MathPainter._traceAmplitudeProbabilityCircle).
                thenFill(amplitudeCircleFillColor).
                thenStroke(amplitudeCircleStrokeColor, 0.5);

                traceCellsWith(MathPainter._traceAmplitudeLogarithmCircle).
                thenStroke(logCircleStrokeColor, 0.5);
            }
        }

        // Dividers.
        painter.trace(trace => trace.grid(x, y, drawArea.w, drawArea.h, numCols, numRows)).
        thenStroke('lightgray');

        if (!hasNaN) {
            // Phase lines.
            if (logCircleStrokeColor !== undefined) {
                traceCellsWith(MathPainter._traceAmplitudePhaseDirection).
                thenStroke(amplitudePhaseStrokeColor);
            }
        }

        // Error text.
        if (hasNaN) {
            painter.print(
                'NaN',
                drawArea.x + drawArea.w/2,
                drawArea.y + drawArea.h/2,
                'center',
                'middle',
                'red',
                '16px sans-serif',
                drawArea.w,
                drawArea.h);
        }
    }
}

export {MathPainter}
