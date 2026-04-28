import WebSocket from "ws";

export class DerivClient {
  constructor({ apiToken, appId }) {
    this.apiToken = apiToken;
    this.appId    = appId;
    this.ws       = null;
    this.reqId    = 0;
    this.pending  = new Map();
    this.account  = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${this.appId}`);
      this.ws.on("open",  () => resolve());
      this.ws.on("error", reject);
      this.ws.on("message", (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }
        const handler = this.pending.get(msg.req_id);
        if (!handler) return;
        this.pending.delete(msg.req_id);
        if (msg.error) {
          const err = new Error(msg.error.message);
          err.code  = msg.error.code;
          handler.reject(err);
        } else {
          handler.resolve(msg);
        }
      });
    });
  }

  send(payload, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = ++this.reqId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ ...payload, req_id: id }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          const err = new Error("Deriv request timed out");
          err.code  = "Timeout";
          reject(err);
        }
      }, timeoutMs);
    });
  }

  // Retries on RateLimit and Timeout errors. Do NOT use for buy() — order placement
  // retries are handled at the call site to get a fresh proposal each attempt.
  async sendRetry(payload, maxAttempts = 3) {
    const delays = [1000, 5000, 10000];
    let lastErr;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await this.send(payload);
      } catch (err) {
        lastErr = err;
        const retriable = err.code === "RateLimit" || err.code === "Timeout";
        if (retriable && i < maxAttempts - 1) {
          const wait = delays[i];
          console.log(`[deriv] ${err.code} — retry ${i + 1}/${maxAttempts - 1} in ${wait / 1000}s`);
          await new Promise(r => setTimeout(r, wait));
        } else {
          throw err;
        }
      }
    }
    throw lastErr;
  }

  async authorize() {
    const auth = await this.send({ authorize: this.apiToken });
    this.account = auth.authorize;
    return this.account;
  }

  async candles({ symbol, granularity, count }) {
    const r = await this.sendRetry({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: "latest",
      granularity,
      style: "candles",
    });
    return r.candles.map(c => ({
      epoch: c.epoch,
      open:  parseFloat(c.open),
      high:  parseFloat(c.high),
      low:   parseFloat(c.low),
      close: parseFloat(c.close),
    }));
  }

  async openPositions() {
    const r = await this.sendRetry({ portfolio: 1 });
    return r.portfolio?.contracts || [];
  }

  async proposal({ symbol, contractType, amount, multiplier, slUsd, tpUsd }) {
    const limit_order = {};
    if (slUsd != null) limit_order.stop_loss  = slUsd;
    if (tpUsd != null) limit_order.take_profit = tpUsd;
    return this.send({
      proposal: 1,
      amount,
      basis:         "stake",
      contract_type: contractType,
      currency:      "USD",
      symbol,
      multiplier,
      limit_order,
    });
  }

  async buy(proposalId, price) {
    return this.send({ buy: proposalId, price });
  }

  async contractStatus(contractId) {
    return this.sendRetry({ proposal_open_contract: 1, contract_id: contractId });
  }

  close() { this.ws?.close(); }
}
