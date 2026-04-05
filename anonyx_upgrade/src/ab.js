const crypto = require("node:crypto");

function stableBucket(userId, salt, modulo) {
  const h = crypto.createHash("sha256").update(String(userId) + "\0" + salt).digest();
  return h.readUInt32BE(0) % modulo;
}

function assignVariants(userId, experiments = {}) {
  const out = {};
  for (const [name, def] of Object.entries(experiments)) {
    const variants = Array.isArray(def.variants) && def.variants.length ? def.variants : ["A", "B"];
    const weights = Array.isArray(def.weights) && def.weights.length === variants.length ? def.weights : null;
    if (weights) {
      const total = weights.reduce((a, b) => a + b, 0) || 1;
      let pick = stableBucket(userId, `ab:${name}`, 100000) / 100000 * total;
      let chosen = variants[variants.length - 1];
      for (let i = 0; i < variants.length; i++) {
        pick -= weights[i];
        if (pick < 0) {
          chosen = variants[i];
          break;
        }
      }
      out[name] = chosen;
    } else {
      out[name] = variants[stableBucket(userId, `ab:${name}`, variants.length)];
    }
  }
  return out;
}

module.exports = { assignVariants };
