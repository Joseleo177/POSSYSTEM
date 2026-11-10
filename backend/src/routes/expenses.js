const router = require('express').Router();
const { auth, permit } = require('../middleware/auth');
const ctrl = require('../controllers/expenseController');

router.use(auth);

router.get('/', permit("accounting.view"),           ctrl.getAll);
router.get('/categories', permit("accounting.view"), ctrl.getCategories);
router.post('/categories', permit("config.edit"), ctrl.upsertCategory);
router.post('/',                   permit("accounting.expense"),  ctrl.create);
// La factura de un egreso ya registrado (Libro de compras): la carga quien registra egresos.
router.patch('/:id/fiscal',        permit("accounting.expense"),  ctrl.setFiscal);
router.delete('/:id/permanent',   permit("accounting.delete"),  ctrl.deleteExpense);
router.delete('/:id',             permit("accounting.void"),  ctrl.voidExpense);

module.exports = router;
