import {Suite, assertThat, assertThrows, assertTrue, assertFalse} from "test/TestUtil.js"
import {ZxEdgeList, ZxType} from "src/sim/zx_edge_list.js"
import {ExternalStabilizer} from "src/sim/external_stabilizer.js"

let suite = new Suite("ZxEdgeList");

suite.test('external_stabilizers', () => {
    assertThat(ZxEdgeList.from_text_diagram(`
in---H---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "Z", +1),
        new ExternalStabilizer("Z", "X", +1),
    ]);

    assertThat(ZxEdgeList.from_text_diagram(`
in---Z(-pi/2)---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "Y", -1),
        new ExternalStabilizer("Z", "Z", +1),
    ]);

    assertThat(ZxEdgeList.from_text_diagram(`
in---Z---out
     |
in---X---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X_", "XX", +1),
        new ExternalStabilizer("Z_", "Z_", +1),
        new ExternalStabilizer("_X", "_X", +1),
        new ExternalStabilizer("_Z", "ZZ", +1),
    ]);

    assertThat(ZxEdgeList.from_text_diagram(`
in---Z---out
     |
in---Z---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("ZZ", "__", +1),
        new ExternalStabilizer("XX", "XX", +1),
        new ExternalStabilizer("_Z", "_Z", +1),
        new ExternalStabilizer("__", "ZZ", +1),
    ]);

    assertThat(ZxEdgeList.from_text_diagram(`
in---Z---Z---out
     |   |
in---X---X---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X_", "X_", +1),
        new ExternalStabilizer("Z_", "Z_", +1),
        new ExternalStabilizer("_X", "_X", +1),
        new ExternalStabilizer("_Z", "_Z", +1),
    ]);

    assertThat(ZxEdgeList.from_text_diagram(`
in-H-X---out
     |
     *---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "ZZ", +1),
        new ExternalStabilizer("Z", "_X", +1),
        new ExternalStabilizer("_", "XX", +1),
    ]);

    assertThat(ZxEdgeList.from_text_diagram(`
out--X-H-in
     |
     *---out
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "ZZ", +1),
        new ExternalStabilizer("Z", "_X", +1),
        new ExternalStabilizer("_", "XX", +1),
    ]);

    assertThat(ZxEdgeList.from_text_diagram(`

        in---Z(pi/2)---out

    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "Y", +1),
        new ExternalStabilizer("Z", "Z", +1),
    ]);

    assertThat(ZxEdgeList.from_text_diagram(`

                                  *-------------Z----------------Z-------Z(pi/2)
                                  |             |                |
            *-----------------Z---+-------------+---Z------------+-------Z(pi/2)
            |                 |   |             |   |            |
            X---X---Z(pi/2)   X---X---Z(pi/2)   X---X---Z(pi/2)  X---X---Z(pi/2)   *-----out
            |   |             |                 |                |   |            /
            *---+-------------Z-----------------+----------------+---Z---Z(pi/2) /
                |                               |                |              /
        in------Z-------------------------------Z---------------Z(pi)----------*

    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "Y", +1),
        new ExternalStabilizer("Z", "Z", +1),
    ]);

    // Shor code.
    assertThat(ZxEdgeList.from_text_diagram(`
                 *----------------------*
                 |                      |
             *---Z----------------------Z---*
             |   |                      |   |
             |   *----------------------*   |
             |                              |
             |   *----------------------*   |
             |   |                      |   |
        in---X---Z----------------------Z---X---out
             |   |                      |   |
             |   *----------------------*   |
             |                              |
             |   *----------------------*   |
             |   |                      |   |
             *---Z----------------------Z---*
                 |                      |
                 *----------------------*
    `).external_stabilizers()).isEqualTo([
        new ExternalStabilizer("X", "X", +1),
        new ExternalStabilizer("Z", "Z", +1),
    ]);
});
