const router = require("express").Router();
const { body } = require('express-validator');
const ctrl   = require("../controllers/customers");
const { auth, permit } = require("../middleware/auth");
const { validateInput } = require('../middleware/validator');

const customerValidations = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('type').isIn(['cliente', 'proveedor']).withMessage('Type must be cliente or proveedor'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Must be a valid email'),
  validateInput
];

router.get("/",               auth, permit("customers.view", "sales.create", "purchases.view"), ctrl.getAll);
router.get("/:id",            auth, permit("customers.view", "sales.create", "purchases.view"), ctrl.getOne);
router.get("/:id/purchases",  auth, permit("customers.view", "sales.create", "purchases.view"), ctrl.getPurchases);
router.post("/",              auth, permit("customers.create"), customerValidations, ctrl.create);
router.put("/:id",            auth, permit("customers.edit"), customerValidations, ctrl.update);
router.patch("/:id/credit",          auth, permit("customers.credit"),              ctrl.adjustCredit);
router.post("/:id/credit-refund",    auth, permit("customers.credit"),   ctrl.creditRefund);
router.delete("/:id",         auth, permit("customers.delete"),                        ctrl.remove);

module.exports = router;
