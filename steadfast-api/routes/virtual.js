const express = require("express");
const router = express.Router();
const NodeCache = require("node-cache");

const virtualOrders = new NodeCache();
let orderId = 1;

module.exports = () => {
  // ===> Get Virtual Orders and Trades
  router.get("/getOrdersAndTrades", (req, res) => {
    const orders = virtualOrders.mget(virtualOrders.keys());
    res.json({
      orderBook: Object.values(orders),
      tradeBook: Object.values(orders).filter(
        (order) => order.status === "COMPLETE"
      ),
    });
    console.log(`\nVirtual Get Orders and Trades`);
  });

  // ===> Place Virtual Order
  router.post("/placeOrder", (req, res) => {
    const { uid, actid, exch, tsym, qty, prd, trantype, prctyp, ret, trgprc } =
      req.body;
    let { prc } = req.body;

    // Apply 2nd point buffer logic for SL-LMT orders
    if (prctyp === "SL-LMT") {
      const triggerPrice = parseFloat(trgprc);
      if (!isNaN(triggerPrice)) {
        if (trantype === "BUY" || trantype === "B") {
          prc = (triggerPrice + 2).toString();
        } else if (trantype === "SELL" || trantype === "S") {
          prc = (triggerPrice - 2).toString();
        }
      }
    }

    const order = {
      norenordno: orderId++,
      uid,
      actid,
      exch,
      tsym,
      qty: parseInt(qty),
      prc: parseFloat(prc),
      prd,
      trantype,
      prctyp,
      trgprc: parseFloat(trgprc) || 0,
      ret,
      status: "COMPLETE",
      orderTimestamp: new Date().toISOString(),
    };

    virtualOrders.set(order.norenordno.toString(), order);

    res.json({ status: "success", norenordno: order.norenordno });
    console.log(`\nVirtual Order Placed:`, order);
  });

  // ===> Cancel Virtual Order
  router.post("/cancelOrder", (req, res) => {
    const { norenordno, uid } = req.body;
    const order = virtualOrders.get(norenordno);

    if (order) {
      order.status = "CANCELLED";
      virtualOrders.set(norenordno, order);
      res.json({ status: "success", result: "cancelled" });
      console.log(`\nVirtual Cancel Order:`, { norenordno }, "Order cancelled");
    } else {
      res.status(404).json({ status: "error", message: "Order not found" });
      console.log(`\nVirtual Cancel Order:`, { norenordno }, "Order not found");
    }
  });

  return router;
};
