const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

app.use(express.static(__dirname));

app.use((req, res, next) => {
  if (req.method === "GET" && !path.extname(req.path)) {
    return res.sendFile(path.join(__dirname, "index.html"));
  }
  next();
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`New We-Care ERP running on port ${PORT}`);
});
