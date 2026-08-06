-- 124: 订单增加客户单号 customer_ref
--
-- 背景：客户报单、对账时说的都是**他们自己的单号**，不是我们的 EU-2026xxxx。
-- 询价表 2026-07 就加了 inquiries.customer_ref，订单一直没有对应字段，
-- 导致「询价阶段能按客户单号对上，转成订单后就对不上了」。
--
-- 为什么不复用已有的 orders.external_ref：
--   那是开放 API（P8）给外部系统对接用的，和 external_source 一起有唯一约束
--   uq_orders_external。客户手填的单号塞进去会撞约束，也会污染 API 侧的语义。
--
-- 刻意不加唯一约束：同一个客户单号拆成多张订单是正常业务
--   （一票货分两个柜 / 分批出运），加唯一约束反而会挡住真实业务。
--
-- 影响面：纯新增可空列，PG 加可空列不重写表、不长时间锁表；
--         老代码读不到这一列也不会出错。
-- 回滚：ALTER TABLE orders DROP COLUMN customer_ref;（新列，无数据依赖）

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_ref VARCHAR(100);

COMMENT ON COLUMN orders.customer_ref IS '客户方单号 / 参考号，用于和客户对账（与 inquiries.customer_ref 同义）';

-- 部分索引：绝大多数历史订单这一列是空的，只索引填了值的行
CREATE INDEX IF NOT EXISTS idx_orders_customer_ref
  ON orders(customer_ref) WHERE customer_ref IS NOT NULL;
