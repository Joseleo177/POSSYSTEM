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

router.get("/",               auth, ctrl.getAll);
router.get("/:id",            auth, ctrl.getOne);
router.get("/:id/purchases",  auth, ctrl.getPurchases);
router.post("/",              auth, permit("customers", "sales", "config"), customerValidations, ctrl.create);
router.put("/:id",            auth, permit("customers", "sales", "config"), customerValidations, ctrl.update);
router.delete("/:id",         auth, permit("admin"),                        ctrl.remove);

module.exports = router;
