// CHP: CNOT-Hadamard-Phase
// Stabilizer Quantum Computer Simulator
// by Scott Aaronson
// Thanks to Simon Anders and Andrew Cross for bugfixes



#include <cstring>
#include <cstdlib>


// Quantum state
struct QState {
    // To save memory and increase speed, the bits are packed 32 to an unsigned long
    QState(long n);
    QState(const struct QState& src, int nothing);
    ~QState();
    long n;         // # of qubits
    unsigned long **x; // (2n+1)*n matrix for stabilizer/destabilizer x bits (there's one "scratch row" at
    unsigned long **z; // (2n+1)*n matrix for z bits                                                 the bottom)
    bool *r;         // Phase bits: 0 for +1, 1 for -1
    long over32; // floor(n/8)+1

    void col_xor(long dst, long src);
};

// Apply a CNOT gate with control b and target c
void col_xor(unsigned long** dst, unsigned long** src, long b, long c, long n) {
    long b5 = b >> 5;
    long c5 = c >> 5;
    unsigned long pwb = 1 << (b & 31);
    unsigned long pwc = 1 << (c & 31);
    for (long i = 0; i < 2*n; i++) {
        if (dst[i][b5] & pwb) {
            src[i][c5] ^= pwc;
        }
    }
}

// Apply a CNOT gate with control b and target c
void cnot(struct QState &q, long b, long c) {
    col_xor(q.x, q.x, b, c, q.n);
    col_xor(q.z, q.z, c, b, q.n);

    long b5 = b>>5;
    long c5 = c>>5;
    unsigned long pwb = 1 << (b&31);
    unsigned long pwc = 1 << (c&31);
    for (long i = 0; i < 2*q.n; i++) {
        bool xib = q.x[i][b5] & pwb;
        bool zib = q.z[i][b5] & pwb;
        bool xic = q.x[i][c5] & pwc;
        bool zic = q.z[i][c5] & pwc;
        q.r[i] ^= xib && zic && (xic == zib);
    }
}

// Apply a Hadamard gate to qubit b
void hadamard(struct QState &q, long b) {
    long b5 = b>>5;
    unsigned long pw = 1 << (b&31);
    for (long i = 0; i < 2*q.n; i++) {
        unsigned long tmp = q.x[i][b5];
        q.x[i][b5] ^= (q.x[i][b5] ^ q.z[i][b5]) & pw;
        q.z[i][b5] ^= (q.z[i][b5] ^ tmp) & pw;
        q.r[i] ^= (q.x[i][b5]&pw) && (q.z[i][b5]&pw);
    }
}


// Apply a phase gate (|0>->|0>, |1>->i|1>) to qubit b
void phase(struct QState &q, long b) {
    long b5 = b >> 5;
    unsigned long pw = 1 << (b&31);
    for (long i = 0; i < 2*q.n; i++) {
        q.r[i] ^= (q.x[i][b5]&pw) && (q.z[i][b5]&pw);
        q.z[i][b5] ^= q.x[i][b5] & pw;
    }
}



// Sets row i equal to row k
void rowcopy(struct QState &q, long i, long k) {
    for (long j = 0; j < q.over32; j++) {
        q.x[i][j] = q.x[k][j];
        q.z[i][j] = q.z[k][j];
    }
    q.r[i] = q.r[k];
}



// Swaps row i and row k
void rowswap(struct QState &q, long i, long k) {
    rowcopy(q, 2*q.n, k);
    rowcopy(q, k, i);
    rowcopy(q, i, 2*q.n);
}



// Sets row i equal to the bth observable (X_1,...X_n,Z_1,...,Z_n)
void rowset(struct QState &q, long i, long b) {
    long b5;
    unsigned long b31;

    for (long j = 0; j < q.over32; j++) {
        q.x[i][j] = 0;
        q.z[i][j] = 0;
    }
    q.r[i] = 0;
    if (b < q.n)
    {
        b5 = b>>5;
        b31 = b&31;
        q.x[i][b5] = 1 << b31;
    }
    else
    {
        b5 = (b - q.n)>>5;
        b31 = (b - q.n)&31;
        q.z[i][b5] = 1 << b31;
    }
}



// Return the phase (0,1,2,3) when row i is LEFT-multiplied by row k
int clifford(struct QState &q, long i, long k) {
    unsigned long pw;
    long e=0; // Power to which i is raised

    for (long j = 0; j < q.over32; j++) {
        for (long l = 0; l < 32; l++) {
            pw = 1 << l;
            // X
            if ((q.x[k][j]&pw) && (!(q.z[k][j]&pw))) {
                if ((q.x[i][j]&pw) && (q.z[i][j]&pw)) e++;         // XY=iZ
                if ((!(q.x[i][j]&pw)) && (q.z[i][j]&pw)) e--;         // XZ=-iY
            }
            // Y
            if ((q.x[k][j]&pw) && (q.z[k][j]&pw)) {
                if ((!(q.x[i][j]&pw)) && (q.z[i][j]&pw)) e++;         // YZ=iX
                if ((q.x[i][j]&pw) && (!(q.z[i][j]&pw))) e--;         // YX=-iZ
            }
            // Z
            if ((!(q.x[k][j]&pw)) && (q.z[k][j]&pw)) {
                if ((q.x[i][j]&pw) && (!(q.z[i][j]&pw))) e++;         // ZX=iY
                if ((q.x[i][j]&pw) && (q.z[i][j]&pw)) e--;         // ZY=-iX
            }
        }
    }

    e = (e+q.r[i]*2+q.r[k]*2)%4;
    if (e>=0) {
        return e;
    }
    return e+4;
}



// Left-multiply row i by row k
void rowmult(struct QState &q, long i, long k) {
    q.r[i] = clifford(q,i,k) >> 1;
    for (long j = 0; j < q.over32; j++) {
        q.x[i][j] ^= q.x[k][j];
        q.z[i][j] ^= q.z[k][j];
    }
}


// Measure qubit b
// Return 0 if outcome would always be 0
//                 1 if outcome would always be 1
//                 2 if outcome was random and 0 was chosen
//                 3 if outcome was random and 1 was chosen
// sup: 1 if determinate measurement results should be suppressed, 0 otherwise
int measure(struct QState &q, long b, int sup, bool random_result) {
    int ran = 0;
    long p; // pivot row in stabilizer
    long m; // pivot row in destabilizer

    long b5 = b>>5;
    unsigned long pw = 1 << (b&31);
    // loop over stabilizer generators
    for (p = 0; p < q.n; p++) {
        if (q.x[p+q.n][b5]&pw) ran = 1;         // if a Zbar does NOT commute with Z_b (the
        if (ran) break;                                                 // operator being measured), then outcome is random
    }

    // If outcome is indeterminate
    if (ran) {
        // Set Xbar_p := Zbar_p
        rowcopy(q, p, p + q.n);
        // Set Zbar_p := Z_b
        rowset(q, p + q.n, b + q.n);
        // moment of quantum randomness
        q.r[p + q.n] = random_result ? 1 : 0;
        // Now update the Xbar's and Zbar's that don't commute with
        for (long i = 0; i < 2*q.n; i++) {
            // Z_b
            if ((i!=p) && (q.x[i][b5]&pw)) {
                rowmult(q, i, p);
            }
        }
        if (q.r[p + q.n]) return 3;
        else return 2;
    }

    // If outcome is determinate
    if ((!ran) && (!sup)) {
        for (m = 0; m < q.n; m++)                         // Before we were checking if stabilizer generators commute
            if (q.x[m][b5]&pw) break;                 // with Z_b; now we're checking destabilizer generators
        rowcopy(q, 2*q.n, m + q.n);
        for (long i = m+1; i < q.n; i++)
            if (q.x[i][b5]&pw)
                rowmult(q, 2*q.n, i + q.n);
        if (q.r[2*q.n]) return 1;
        else return 0;
    }

    return 0;

}



// Do Gaussian elimination to put the stabilizer generators in the following form:
// At the top, a minimal set of generators containing X's and Y's, in "quasi-upper-triangular" form.
// (Return value = number of such generators = log_2 of number of nonzero basis states)
// At the bottom, generators containing Z's only in quasi-upper-triangular form.
long gaussian(struct QState &q) {

    long i = q.n;
    long k;
    long k2;
    long j;
    long j5;
    long g; // Return value
    unsigned long pw;

    for (long j = 0; j < q.n; j++) {
        j5 = j>>5;
        pw = 1 << (j&31);
        for (k = i; k < 2*q.n; k++) // Find a generator containing X in jth column
            if (q.x[k][j5]&pw) break;
        if (k < 2*q.n)
        {
            rowswap(q, i, k);
            rowswap(q, i-q.n, k-q.n);
            for (k2 = i+1; k2 < 2*q.n; k2++)
                if (q.x[k2][j5]&pw)
                {
                    rowmult(q, k2, i);         // Gaussian elimination step
                    rowmult(q, i-q.n, k2-q.n);
                }
            i++;
        }
    }
    g = i - q.n;

    for (long j = 0; j < q.n; j++) {
        j5 = j>>5;
        pw = 1 << (j&31);
        for (k = i; k < 2*q.n; k++) // Find a generator containing Z in jth column
            if (q.z[k][j5]&pw) break;
        if (k < 2*q.n) {
            rowswap(q, i, k);
            rowswap(q, i-q.n, k-q.n);
            for (k2 = i+1; k2 < 2*q.n; k2++) {
                if (q.z[k2][j5]&pw) {
                    rowmult(q, k2, i);
                    rowmult(q, i-q.n, k2-q.n);
                }
            }
            i++;
        }
    }

    return g;
}



// Finds a Pauli operator P such that the basis state P|0...0> occurs with nonzero amplitude in q, and
// writes P to the scratch space of q.  For this to work, Gaussian elimination must already have been
// performed on q.  g is the return value from gaussian(q).
void seed(struct QState &q, long g) {
    long j5;
    unsigned long pw;
    long min;

    q.r[2*q.n] = 0;
    for (long j = 0; j < q.over32; j++) {
        q.x[2*q.n][j] = 0;         // Wipe the scratch space clean
        q.z[2*q.n][j] = 0;
    }

    for (long i = 2*q.n - 1; i >= q.n + g; i--) {
        int f = q.r[i] * 2;
        for (long j = q.n - 1; j >= 0; j--) {
            j5 = j>>5;
            pw = 1 << (j&31);
            if (q.z[i][j5]&pw) {
                min = j;
                if (q.x[2*q.n][j5]&pw) f = (f+2)%4;
            }
        }
        if (f==2) {
            j5 = min>>5;
            pw = 1 << (min&31);
            q.x[2*q.n][j5] ^= pw;         // Make the seed consistent with the ith equation
        }
    }
}



// Initialize state q to have n qubits, and input specified by s
QState::QState(long n) : n(n) {
    x = new unsigned long *[2 * n + 1];
    z = new unsigned long *[2 * n + 1];
    r = new bool[2 * n + 1];
    over32 = (n>>5) + 1;
    for (long i = 0; i < 2*n + 1; i++) {
        x[i] = new unsigned long[over32];
        z[i] = new unsigned long[over32];
        long j;
        for (j = 0; j < over32; j++) {
            x[i][j] = 0;
            z[i][j] = 0;
        }
        if (i < n) {
            x[i][i>>5] = 1 << (i&31);
        } else if (i < 2*n) {
            j = i-n;
            z[i][j>>5] = 1 << (j&31);
        }
        r[i] = 0;
    }
}

QState::~QState() {
    for (long i = 0; i < 2 * n + 1; i++) {
        delete[] x[i];
        delete[] z[i];
    }
    delete[] x;
    delete[] z;
    delete[] r;
}

QState::QState(const struct QState &src, int nothing) {
    n = src.n;
    over32 = src.over32;

    int s = 2 * n + 1;
    r = new bool[s];
    memcpy(r, src.r, s * sizeof(int));

    x = new unsigned long *[s];
    z = new unsigned long *[s];
    for (int i = 0; i < s; i++) {
        x[i] = new unsigned long[over32];
        z[i] = new unsigned long[over32];
        memcpy(x[i], src.x[i], over32 * sizeof(unsigned long));
        memcpy(z[i], src.z[i], over32 * sizeof(unsigned long));
    }
}

char peek_state_x(const struct QState &src, int row, int col) {
    int c = col >> 5;
    int m = 1 << (col & 31);
    return (src.x[row][c] & m) ? 1 : 0;
}

char peek_state_z(const struct QState &src, int row, int col) {
    int c = col >> 5;
    int m = 1 << (col & 31);
    return (src.z[row][c] & m) ? 1 : 0;
}

char peek_state_r(const struct QState &src, int row) {
    return src.r[row] ? 1 : 0;
}

#include <emscripten/bind.h>
using namespace emscripten;
EMSCRIPTEN_BINDINGS(my_module) {
        class_<QState>("QState").constructor<long>().constructor<const struct QState&, int>();
        function("cnot", &cnot);
        function("hadamard", &hadamard);
        function("phase", &phase);
        function("measure", &measure);
        function("peek_state_x", &peek_state_x);
        function("peek_state_z", &peek_state_z);
        function("peek_state_r", &peek_state_r);
}
