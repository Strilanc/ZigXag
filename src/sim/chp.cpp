// CHP: CNOT-Hadamard-Phase
// Stabilizer Quantum Computer Simulator
// by Scott Aaronson
// Last modified June 30, 2004

// Thanks to Simon Anders and Andrew Cross for bugfixes



#include <cstring>
#include <cstdlib>


struct QState

// Quantum state

{

    // To save memory and increase speed, the bits are packed 32 to an unsigned long
    long n;         // # of qubits
    unsigned long **x; // (2n+1)*n matrix for stabilizer/destabilizer x bits (there's one "scratch row" at
    unsigned long **z; // (2n+1)*n matrix for z bits                                                 the bottom)
    int *r;         // Phase bits: 0 for +1, 1 for i, 2 for -1, 3 for -i.  Normally either 0 or 2.
    long over32; // floor(n/8)+1

};




void cnot(struct QState &q, long b, long c)

// Apply a CNOT gate with control b and target c

{

    long i;
    long b5;
    long c5;
    unsigned long pwb;
    unsigned long pwc;

    b5 = b>>5;
    c5 = c>>5;
    pwb = 1 << (b&31);
    pwc = 1 << (c&31);
    for (i = 0; i < 2*q.n; i++)
    {
        if (q.x[i][b5]&pwb) q.x[i][c5] ^= pwc;
        if (q.z[i][c5]&pwc) q.z[i][b5] ^= pwb;
        if ((q.x[i][b5]&pwb) && (q.z[i][c5]&pwc) &&
            (q.x[i][c5]&pwc) && (q.z[i][b5]&pwb))
            q.r[i] = (q.r[i]+2)%4;
        if ((q.x[i][b5]&pwb) && (q.z[i][c5]&pwc) &&
            !(q.x[i][c5]&pwc) && !(q.z[i][b5]&pwb))
            q.r[i] = (q.r[i]+2)%4;
    }

    return;

}



void hadamard(struct QState &q, long b)

// Apply a Hadamard gate to qubit b

{

    long i;
    unsigned long tmp;
    long b5;
    unsigned long pw;

    b5 = b>>5;
    pw = 1 << (b&31);
    for (i = 0; i < 2*q.n; i++)
    {
        tmp = q.x[i][b5];
        q.x[i][b5] ^= (q.x[i][b5] ^ q.z[i][b5]) & pw;
        q.z[i][b5] ^= (q.z[i][b5] ^ tmp) & pw;
        if ((q.x[i][b5]&pw) && (q.z[i][b5]&pw)) q.r[i] = (q.r[i]+2)%4;
    }

    return;

}



void phase(struct QState &q, long b)

// Apply a phase gate (|0>->|0>, |1>->i|1>) to qubit b

{

    long i;
    long b5;
    unsigned long pw;

    b5 = b>>5;
    pw = 1 << (b&31);
    for (i = 0; i < 2*q.n; i++)
    {
        if ((q.x[i][b5]&pw) && (q.z[i][b5]&pw)) q.r[i] = (q.r[i]+2)%4;
        q.z[i][b5] ^= q.x[i][b5]&pw;
    }

    return;

}



void rowcopy(struct QState &q, long i, long k)

// Sets row i equal to row k

{

    long j;

    for (j = 0; j < q.over32; j++)
    {
        q.x[i][j] = q.x[k][j];
        q.z[i][j] = q.z[k][j];
    }
    q.r[i] = q.r[k];

    return;

}



void rowswap(struct QState &q, long i, long k)

// Swaps row i and row k

{

    rowcopy(q, 2*q.n, k);
    rowcopy(q, k, i);
    rowcopy(q, i, 2*q.n);

    return;

}



void rowset(struct QState &q, long i, long b)

// Sets row i equal to the bth observable (X_1,...X_n,Z_1,...,Z_n)

{

    long j;
    long b5;
    unsigned long b31;

    for (j = 0; j < q.over32; j++)
    {
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

    return;

}



int clifford(struct QState &q, long i, long k)

// Return the phase (0,1,2,3) when row i is LEFT-multiplied by row k

{

    long j;
    long l;
    unsigned long pw;
    long e=0; // Power to which i is raised

    for (j = 0; j < q.over32; j++)
        for (l = 0; l < 32; l++)
        {
            pw = 1 << l;
            if ((q.x[k][j]&pw) && (!(q.z[k][j]&pw))) // X
            {
                if ((q.x[i][j]&pw) && (q.z[i][j]&pw)) e++;         // XY=iZ
                if ((!(q.x[i][j]&pw)) && (q.z[i][j]&pw)) e--;         // XZ=-iY
            }
            if ((q.x[k][j]&pw) && (q.z[k][j]&pw))                                 // Y
            {
                if ((!(q.x[i][j]&pw)) && (q.z[i][j]&pw)) e++;         // YZ=iX
                if ((q.x[i][j]&pw) && (!(q.z[i][j]&pw))) e--;         // YX=-iZ
            }
            if ((!(q.x[k][j]&pw)) && (q.z[k][j]&pw))                         // Z
            {
                if ((q.x[i][j]&pw) && (!(q.z[i][j]&pw))) e++;         // ZX=iY
                if ((q.x[i][j]&pw) && (q.z[i][j]&pw)) e--;         // ZY=-iX
            }
        }

    e = (e+q.r[i]+q.r[k])%4;
    if (e>=0) return e;
    else return e+4;

}



void rowmult(struct QState &q, long i, long k)

// Left-multiply row i by row k

{

    long j;

    q.r[i] = clifford(q,i,k);
    for (j = 0; j < q.over32; j++)
    {
        q.x[i][j] ^= q.x[k][j];
        q.z[i][j] ^= q.z[k][j];
    }

    return;

}



int measure(struct QState &q, long b, int sup, bool random_result)

// Measure qubit b
// Return 0 if outcome would always be 0
//                 1 if outcome would always be 1
//                 2 if outcome was random and 0 was chosen
//                 3 if outcome was random and 1 was chosen
// sup: 1 if determinate measurement results should be suppressed, 0 otherwise

{

    int ran = 0;
    long i;
    long p; // pivot row in stabilizer
    long m; // pivot row in destabilizer
    long b5;
    unsigned long pw;

    b5 = b>>5;
    pw = 1 << (b&31);
    for (p = 0; p < q.n; p++)         // loop over stabilizer generators
    {
        if (q.x[p+q.n][b5]&pw) ran = 1;         // if a Zbar does NOT commute with Z_b (the
        if (ran) break;                                                 // operator being measured), then outcome is random
    }

    // If outcome is indeterminate
    if (ran)
    {
        rowcopy(q, p, p + q.n);                         // Set Xbar_p := Zbar_p
        rowset(q, p + q.n, b + q.n);                 // Set Zbar_p := Z_b
        q.r[p + q.n] = 2*(random_result ? 1 : 0);                 // moment of quantum randomness
        for (i = 0; i < 2*q.n; i++)                 // Now update the Xbar's and Zbar's that don't commute with
            if ((i!=p) && (q.x[i][b5]&pw))         // Z_b
                rowmult(q, i, p);
        if (q.r[p + q.n]) return 3;
        else return 2;
    }

    // If outcome is determinate
    if ((!ran) && (!sup))
    {
        for (m = 0; m < q.n; m++)                         // Before we were checking if stabilizer generators commute
            if (q.x[m][b5]&pw) break;                 // with Z_b; now we're checking destabilizer generators
        rowcopy(q, 2*q.n, m + q.n);
        for (i = m+1; i < q.n; i++)
            if (q.x[i][b5]&pw)
                rowmult(q, 2*q.n, i + q.n);
        if (q.r[2*q.n]) return 1;
        else return 0;
        /*for (i = m+1; i < q.n; i++)
                if (q.x[i][b5]&pw)
                {
                        rowmult(q, m + q.n, i + q.n);
                        rowmult(q, i, m);
                }
        return (int)q.r[m + q.n];*/
    }

    return 0;

}



long gaussian(struct QState &q)

// Do Gaussian elimination to put the stabilizer generators in the following form:
// At the top, a minimal set of generators containing X's and Y's, in "quasi-upper-triangular" form.
// (Return value = number of such generators = log_2 of number of nonzero basis states)
// At the bottom, generators containing Z's only in quasi-upper-triangular form.

{

    long i = q.n;
    long k;
    long k2;
    long j;
    long j5;
    long g; // Return value
    unsigned long pw;

    for (j = 0; j < q.n; j++)
    {
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

    for (j = 0; j < q.n; j++)
    {
        j5 = j>>5;
        pw = 1 << (j&31);
        for (k = i; k < 2*q.n; k++) // Find a generator containing Z in jth column
            if (q.z[k][j5]&pw) break;
        if (k < 2*q.n)
        {
            rowswap(q, i, k);
            rowswap(q, i-q.n, k-q.n);
            for (k2 = i+1; k2 < 2*q.n; k2++)
                if (q.z[k2][j5]&pw)
                {
                    rowmult(q, k2, i);
                    rowmult(q, i-q.n, k2-q.n);
                }
            i++;
        }
    }

    return g;

}



long innerprod(struct QState &q1, struct QState &q2)

// Returns -1 if q1 and q2 are orthogonal
// Otherwise, returns a nonnegative integer s such that the inner product is (1/sqrt(2))^s

{

    return 0;

}



void seed(struct QState &q, long g)

// Finds a Pauli operator P such that the basis state P|0...0> occurs with nonzero amplitude in q, and
// writes P to the scratch space of q.  For this to work, Gaussian elimination must already have been
// performed on q.  g is the return value from gaussian(q).

{

    long i;
    long j;
    long j5;
    unsigned long pw;
    int f;
    long min;

    q.r[2*q.n] = 0;
    for (j = 0; j < q.over32; j++)
    {
        q.x[2*q.n][j] = 0;         // Wipe the scratch space clean
        q.z[2*q.n][j] = 0;
    }
    for (i = 2*q.n - 1; i >= q.n + g; i--)
    {
        f = q.r[i];
        for (j = q.n - 1; j >= 0; j--)
        {
            j5 = j>>5;
            pw = 1 << (j&31);
            if (q.z[i][j5]&pw)
            {
                min = j;
                if (q.x[2*q.n][j5]&pw) f = (f+2)%4;
            }
        }
        if (f==2)
        {
            j5 = min>>5;
            pw = 1 << (min&31);
            q.x[2*q.n][j5] ^= pw;         // Make the seed consistent with the ith equation
        }
    }

    return;

}



void initstae_(struct QState &q, long n)

// Initialize state q to have n qubits, and input specified by s

{

    long i;
    long j;

    q.n = n;
    q.x = static_cast<unsigned long **>(malloc((2 * q.n + 1) * sizeof(unsigned long*)));
    q.z = static_cast<unsigned long **>(malloc((2 * q.n + 1) * sizeof(unsigned long*)));
    q.r = static_cast<int *>(malloc((2 * q.n + 1) * sizeof(int)));
    q.over32 = (q.n>>5) + 1;
    for (i = 0; i < 2*q.n + 1; i++)
    {
        q.x[i] = static_cast<unsigned long *>(malloc(q.over32 * sizeof(unsigned long)));
        q.z[i] = static_cast<unsigned long *>(malloc(q.over32 * sizeof(unsigned long)));
        for (j = 0; j < q.over32; j++)
        {
            q.x[i][j] = 0;
            q.z[i][j] = 0;
        }
        if (i < q.n)
            q.x[i][i>>5] = 1 << (i&31);
        else if (i < 2*q.n)
        {
            j = i-q.n;
            q.z[i][j>>5] = 1 << (j&31);
        }
        q.r[i] = 0;
    }

    return;

}


void free_state(struct QState &q) {
    for (long i = 0; i < 2 * q.n + 1; i++) {
        free(q.x[i]);
        free(q.z[i]);
    }
    free(q.x);
    free(q.z);
    free(q.r);
}

void copy_state(struct QState &q, const struct QState &src) {
    q.n = src.n;
    q.over32 = src.over32;

    int s = 2 * q.n + 1;
    q.r = static_cast<int *>(malloc(s * sizeof(int)));
    memcpy(q.r, src.r, s * sizeof(int));

    q.x = static_cast<unsigned long **>(malloc(s * sizeof(unsigned long *)));
    q.z = static_cast<unsigned long **>(malloc(s * sizeof(unsigned long *)));
    for (int i = 0; i < s; i++) {
        q.x[i] = static_cast<unsigned long *>(malloc(q.over32 * sizeof(unsigned long)));
        q.z[i] = static_cast<unsigned long *>(malloc(q.over32 * sizeof(unsigned long)));
        memcpy(q.x[i], src.x[i], q.over32 * sizeof(unsigned long));
        memcpy(q.z[i], src.z[i], q.over32 * sizeof(unsigned long));
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
        class_<QState>("QState").constructor<>();
        function("init_state", &initstae_);
        function("cnot", &cnot);
        function("hadamard", &hadamard);
        function("phase", &phase);
        function("measure", &measure);
        function("free_state", &free_state);
        function("copy_state", &copy_state);
        function("peek_state_x", &peek_state_x);
        function("peek_state_z", &peek_state_z);
        function("peek_state_r", &peek_state_r);
}
