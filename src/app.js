const { client } = require("./chat_bot/bot");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const express = require("express");
const sequelize = require("./config/database");
const accountRoutes = require("./routes/accounts");
dotenv.config();

const app = express();
const PORT = process.env.EXPRESS_PORT || 3000;

app.use(express.json());
app.use("/api", accountRoutes);

const router = express.Router();
router.use((req, res, next) => {
  res.status(404).json({ message: "Not Found" });
});
app.use("/", router);

app.listen(PORT, () => {
  console.log("Server running on port 3000");
});

// const user = { id: 1, username: "test" };
// const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET);
// console.log(token);

sequelize
  .sync()
  .then(() => {
    console.log("Database connected!");
  })
  .catch((err) => {
    console.error("Database connection failed:", err);
  });

(async () => {
  await sequelize.sync({ alter: true });
})();
