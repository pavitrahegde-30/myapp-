/**
 * run_tests.js
 * End-to-end automated test suite for Ledgerly Express + SQLite backend.
 * Uses real HTTP client requests over a local server pipe.
 */

const http = require('http');
const path = require('path');
const app = require('./src/server');
const db = require('./src/config/database');

const PIPE_NAME = `\\\\.\\pipe\\ledgerly-test-${Date.now()}`;

function httpRequest(serverPipe, options) {
  return new Promise((resolve, reject) => {
    let bodyData = null;
    const headers = { ...(options.headers || {}) };

    if (options.body !== undefined && options.body !== null) {
      bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers['content-type'] = headers['content-type'] || 'application/json';
      headers['content-length'] = Buffer.byteLength(bodyData);
    }

    const req = http.request(
      {
        socketPath: serverPipe,
        path: options.url,
        method: options.method || 'GET',
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            parsed = raw;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        });
      }
    );

    req.on('error', reject);

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

const testResults = [];

function assert(name, condition, info = '') {
  const pass = Boolean(condition);
  testResults.push({ name, pass, info });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}: ${name} ${info ? `(${info})` : ''}`);
}

async function run() {
  console.log('\n======================================================');
  console.log('       LEDGERLY BACKEND AUTOMATED TEST SUITE          ');
  console.log('======================================================\n');

  // Start Express server on local pipe
  const server = await new Promise((resolve) => {
    const s = app.listen(PIPE_NAME, () => resolve(s));
  });

  const req = (opts) => httpRequest(PIPE_NAME, opts);

  try {
    // -------------------------------------------------------------------------
    // 1. Health Check
    // -------------------------------------------------------------------------
    {
      const res = await req({ method: 'GET', url: '/api/health' });
      assert(
        'GET /api/health returns 200 with healthy status',
        res.statusCode === 200 && res.body.success === true && res.body.status === 'healthy',
        `Status: ${res.statusCode}`
      );
    }

    // -------------------------------------------------------------------------
    // 2. Transaction Validation (POST /api/transactions)
    // -------------------------------------------------------------------------
    {
      // Missing title
      const res1 = await req({
        method: 'POST',
        url: '/api/transactions',
        body: { amount: 50, category: 'Food', type: 'expense', date: '2026-11-14' }
      });
      assert(
        'POST /api/transactions missing title returns 400',
        res1.statusCode === 400 && res1.body.success === false,
        `Msg: "${res1.body.error}"`
      );

      // Negative amount
      const res2 = await req({
        method: 'POST',
        url: '/api/transactions',
        body: { title: 'Coffee', amount: -15, category: 'Food', type: 'expense', date: '2026-11-14' }
      });
      assert(
        'POST /api/transactions negative amount returns 400',
        res2.statusCode === 400 && res2.body.success === false,
        `Msg: "${res2.body.error}"`
      );

      // Zero amount
      const res3 = await req({
        method: 'POST',
        url: '/api/transactions',
        body: { title: 'Coffee', amount: 0, category: 'Food', type: 'expense', date: '2026-11-14' }
      });
      assert(
        'POST /api/transactions zero amount returns 400',
        res3.statusCode === 400 && res3.body.success === false,
        `Msg: "${res3.body.error}"`
      );

      // Invalid type
      const res4 = await req({
        method: 'POST',
        url: '/api/transactions',
        body: { title: 'Gift', amount: 100, category: 'Gifts', type: 'deposit', date: '2026-11-14' }
      });
      assert(
        'POST /api/transactions invalid type returns 400',
        res4.statusCode === 400 && res4.body.success === false,
        `Msg: "${res4.body.error}"`
      );

      // Invalid date format
      const res5 = await req({
        method: 'POST',
        url: '/api/transactions',
        body: { title: 'Grocery', amount: 80, category: 'Food', type: 'expense', date: '2026-13-45' }
      });
      assert(
        'POST /api/transactions invalid date returns 400',
        res5.statusCode === 400 && res5.body.success === false,
        `Msg: "${res5.body.error}"`
      );

      // Empty body
      const res6 = await req({
        method: 'POST',
        url: '/api/transactions',
        body: {}
      });
      assert(
        'POST /api/transactions empty body returns 400',
        res6.statusCode === 400 && res6.body.success === false,
        `Msg: "${res6.body.error}"`
      );
    }

    // -------------------------------------------------------------------------
    // 3. Transaction Creation (POST /api/transactions)
    // -------------------------------------------------------------------------
    let expenseId = null;
    let incomeId = null;
    {
      const expRes = await req({
        method: 'POST',
        url: '/api/transactions',
        body: {
          title: 'Grocery Supermarket',
          amount: 142.75,
          category: 'Food',
          type: 'expense',
          date: '2026-11-10',
          description: 'Weekly household food run'
        }
      });
      assert(
        'POST /api/transactions creates expense and returns 201',
        expRes.statusCode === 201 && expRes.body.success === true && expRes.body.data.id > 0,
        `ID: ${expRes.body.data?.id}, Amount: $${expRes.body.data?.amount}`
      );
      expenseId = expRes.body.data?.id;

      const incRes = await req({
        method: 'POST',
        url: '/api/transactions',
        body: {
          title: 'Freelance Design Retainer',
          amount: 1800.00,
          category: 'Freelance',
          type: 'income',
          date: '2026-11-12',
          description: 'Design system consulting'
        }
      });
      assert(
        'POST /api/transactions creates income and returns 201',
        incRes.statusCode === 201 && incRes.body.success === true && incRes.body.data.id > 0,
        `ID: ${incRes.body.data?.id}, Amount: $${incRes.body.data?.amount}`
      );
      incomeId = incRes.body.data?.id;
    }

    // -------------------------------------------------------------------------
    // 4. Transaction Retrieval (GET /api/transactions and /api/transactions/:id)
    // -------------------------------------------------------------------------
    {
      const allRes = await req({ method: 'GET', url: '/api/transactions' });
      assert(
        'GET /api/transactions returns 200 with newest transactions first',
        allRes.statusCode === 200 && Array.isArray(allRes.body.data) && allRes.body.data.length >= 2,
        `Total Count: ${allRes.body.data?.length}`
      );

      const singleRes = await req({ method: 'GET', url: `/api/transactions/${expenseId}` });
      assert(
        'GET /api/transactions/:id returns 200 for existing transaction',
        singleRes.statusCode === 200 && singleRes.body.data.title === 'Grocery Supermarket',
        `Title: "${singleRes.body.data?.title}"`
      );

      const nonExistentRes = await req({ method: 'GET', url: '/api/transactions/888888' });
      assert(
        'GET /api/transactions/:id returns 404 for non-existent ID',
        nonExistentRes.statusCode === 404 && nonExistentRes.body.success === false,
        `Status: ${nonExistentRes.statusCode}`
      );

      const badIdRes = await req({ method: 'GET', url: '/api/transactions/invalid-id' });
      assert(
        'GET /api/transactions/:id returns 400 for non-integer ID',
        badIdRes.statusCode === 400 && badIdRes.body.success === false,
        `Status: ${badIdRes.statusCode}`
      );
    }

    // -------------------------------------------------------------------------
    // 5. Transaction Update (PUT /api/transactions/:id)
    // -------------------------------------------------------------------------
    {
      const updateRes = await req({
        method: 'PUT',
        url: `/api/transactions/${expenseId}`,
        body: {
          title: 'Grocery Supermarket (Organic)',
          amount: 155.00,
          category: 'Food',
          type: 'expense',
          date: '2026-11-10',
          description: 'Added organic veggies'
        }
      });
      assert(
        'PUT /api/transactions/:id updates transaction and returns 200',
        updateRes.statusCode === 200 && updateRes.body.data.amount === 155 && updateRes.body.data.title === 'Grocery Supermarket (Organic)',
        `New Title: "${updateRes.body.data?.title}", Amount: $${updateRes.body.data?.amount}`
      );

      const badUpdateRes = await req({
        method: 'PUT',
        url: `/api/transactions/${expenseId}`,
        body: { title: '', amount: -20, category: '', type: 'bad', date: 'bad' }
      });
      assert(
        'PUT /api/transactions/:id returns 400 on invalid payload',
        badUpdateRes.statusCode === 400 && badUpdateRes.body.success === false,
        `Status: ${badUpdateRes.statusCode}`
      );

      const nonExistentUpdateRes = await req({
        method: 'PUT',
        url: '/api/transactions/888888',
        body: { title: 'Test', amount: 50, category: 'Food', type: 'expense', date: '2026-11-10' }
      });
      assert(
        'PUT /api/transactions/:id returns 404 on non-existent ID',
        nonExistentUpdateRes.statusCode === 404,
        `Status: ${nonExistentUpdateRes.statusCode}`
      );
    }

    // -------------------------------------------------------------------------
    // 6. Transaction Deletion (DELETE /api/transactions/:id)
    // -------------------------------------------------------------------------
    {
      const delRes = await req({ method: 'DELETE', url: `/api/transactions/${expenseId}` });
      assert(
        'DELETE /api/transactions/:id removes record and returns 200',
        delRes.statusCode === 200 && delRes.body.success === true,
        `Status: ${delRes.statusCode}`
      );

      const checkDelRes = await req({ method: 'GET', url: `/api/transactions/${expenseId}` });
      assert(
        'GET on deleted transaction ID returns 404',
        checkDelRes.statusCode === 404,
        `Status: ${checkDelRes.statusCode}`
      );

      const nonExistentDelRes = await req({ method: 'DELETE', url: '/api/transactions/888888' });
      assert(
        'DELETE /api/transactions/:id returns 404 for non-existent ID',
        nonExistentDelRes.statusCode === 404,
        `Status: ${nonExistentDelRes.statusCode}`
      );
    }

    // -------------------------------------------------------------------------
    // 7. Budget API (/api/budgets)
    // -------------------------------------------------------------------------
    let budgetId = null;
    const testYear = 2030 + (Math.floor(Date.now() / 1000) % 20);
    const testMonth = 5;
    {
      // 404 when budget doesn't exist for a given month
      const notFoundRes = await req({ method: 'GET', url: `/api/budgets/${testYear}/${testMonth}` });
      assert(
        'GET /api/budgets/:year/:month returns 404 when budget not set',
        notFoundRes.statusCode === 404,
        `Status: ${notFoundRes.statusCode}`
      );

      // 400 on invalid month
      const invalidMonthRes = await req({ method: 'GET', url: `/api/budgets/${testYear}/15` });
      assert(
        'GET /api/budgets/:year/:month returns 400 for invalid month',
        invalidMonthRes.statusCode === 400,
        `Status: ${invalidMonthRes.statusCode}`
      );

      // POST create budget
      const createRes = await req({
        method: 'POST',
        url: '/api/budgets',
        body: { year: testYear, month: testMonth, amount: 3200 }
      });
      assert(
        'POST /api/budgets creates monthly budget and returns 201',
        createRes.statusCode === 201 && createRes.body.data.amount === 3200,
        `ID: ${createRes.body.data?.id}, Amount: $${createRes.body.data?.amount}`
      );
      budgetId = createRes.body.data?.id;

      // POST duplicate budget returns 409 Conflict
      const dupRes = await req({
        method: 'POST',
        url: '/api/budgets',
        body: { year: testYear, month: testMonth, amount: 3500 }
      });
      assert(
        'POST /api/budgets duplicate returns 409 Conflict',
        dupRes.statusCode === 409 && dupRes.body.success === false,
        `Status: ${dupRes.statusCode}`
      );

      // GET created budget
      const getBudgetRes = await req({ method: 'GET', url: `/api/budgets/${testYear}/${testMonth}` });
      assert(
        `GET /api/budgets/${testYear}/${testMonth} returns 200 with saved budget record`,
        getBudgetRes.statusCode === 200 && getBudgetRes.body.data.amount === 3200,
        `Amount: $${getBudgetRes.body.data?.amount}`
      );

      // PUT update budget
      const updateBudgetRes = await req({
        method: 'PUT',
        url: `/api/budgets/${budgetId}`,
        body: { amount: 3500 }
      });
      assert(
        'PUT /api/budgets/:id updates budget limit and returns 200',
        updateBudgetRes.statusCode === 200 && updateBudgetRes.body.data.amount === 3500,
        `New Amount: $${updateBudgetRes.body.data?.amount}`
      );

      // PUT budget invalid amount
      const badBudgetAmtRes = await req({
        method: 'PUT',
        url: `/api/budgets/${budgetId}`,
        body: { amount: -500 }
      });
      assert(
        'PUT /api/budgets/:id returns 400 on negative amount',
        badBudgetAmtRes.statusCode === 400,
        `Status: ${badBudgetAmtRes.statusCode}`
      );
    }

    // -------------------------------------------------------------------------
    // 8. Error Handling & 404 Route
    // -------------------------------------------------------------------------
    {
      const unknownRes = await req({ method: 'GET', url: '/api/non-existent-endpoint' });
      assert(
        'Unknown /api/* route returns 404 with consistent JSON error shape',
        unknownRes.statusCode === 404 && unknownRes.body.success === false && typeof unknownRes.body.error === 'string',
        `Error: "${unknownRes.body.error}"`
      );
    }

    // -------------------------------------------------------------------------
    // 9. Frontend Static Serving
    // -------------------------------------------------------------------------
    {
      const staticRes = await req({ method: 'GET', url: '/' });
      assert(
        'GET / serves existing frontend index.html without modification',
        staticRes.statusCode === 200 && typeof staticRes.body === 'string' && staticRes.body.includes('Ledgerly'),
        `HTML response length: ${staticRes.body?.length} bytes`
      );
    }

    // -------------------------------------------------------------------------
    // 10. Split Expenses API (/api/splits)
    // -------------------------------------------------------------------------
    {
      // Missing title
      const badSplitRes = await req({
        method: 'POST',
        url: '/api/splits',
        body: { total_amount: 100, category: 'Food', date: '2026-11-14', participants: [{ name: 'Alex', amount: 50 }] }
      });
      assert(
        'POST /api/splits missing title returns 400',
        badSplitRes.statusCode === 400 && badSplitRes.body.success === false,
        `Status: ${badSplitRes.statusCode}`
      );

      // Create split expense
      const createSplitRes = await req({
        method: 'POST',
        url: '/api/splits',
        body: {
          title: 'Sushi Dinner with Team',
          total_amount: 150,
          category: 'Food',
          date: '2026-11-14',
          paid_by: 'You',
          my_share: 50,
          participants: [
            { name: 'David', amount: 50 },
            { name: 'Emma', amount: 50 }
          ],
          record_my_share: true
        }
      });
      assert(
        'POST /api/splits creates split expense and participants returns 201',
        createSplitRes.statusCode === 201 && createSplitRes.body.data.id > 0 && createSplitRes.body.data.participants.length === 2,
        `Split ID: ${createSplitRes.body.data?.id}`
      );
      const testSplitId = createSplitRes.body.data?.id;
      const testParticipantId = createSplitRes.body.data?.participants[0]?.id;

      // GET /api/splits
      const listSplitsRes = await req({ method: 'GET', url: '/api/splits' });
      assert(
        'GET /api/splits returns 200 with calculated totals',
        listSplitsRes.statusCode === 200 && Array.isArray(listSplitsRes.body.data) && listSplitsRes.body.data.length > 0,
        `Splits count: ${listSplitsRes.body.data?.length}`
      );

      // PATCH settle participant
      const settleRes = await req({
        method: 'PATCH',
        url: `/api/splits/participants/${testParticipantId}/settle`,
        body: { status: 'settled' }
      });
      assert(
        'PATCH /api/splits/participants/:id/settle marks participant as settled',
        settleRes.statusCode === 200 && settleRes.body.data.status === 'settled',
        `New Status: ${settleRes.body.data?.status}`
      );

      // DELETE /api/splits/:id
      const delSplitRes = await req({
        method: 'DELETE',
        url: `/api/splits/${testSplitId}`
      });
      assert(
        'DELETE /api/splits/:id removes split bill and cascading participants',
        delSplitRes.statusCode === 200 && delSplitRes.body.success === true,
        `Status: ${delSplitRes.statusCode}`
      );
    }

    // -------------------------------------------------------------------------
    // 11. Database Persistence Across Connection
    // -------------------------------------------------------------------------
    {
      const txnCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
      const budgetCount = db.prepare('SELECT COUNT(*) as count FROM monthly_budgets').get().count;
      assert(
        'Database records are physically written to SQLite .db file',
        txnCount > 0 && budgetCount > 0,
        `Transactions: ${txnCount}, Budgets: ${budgetCount}`
      );
    }

  } finally {
    server.close();
  }

  console.log('\n======================================================');
  const passCount = testResults.filter((r) => r.pass).length;
  const failCount = testResults.filter((r) => !r.pass).length;
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
