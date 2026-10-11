type HomePageProps = {
  onOpenMaterials: () => void
  onNewRequisition: () => void
}

const orders = [
  [
    'PR-CI-ABJ-20261010-001',
    '阿比让仓库加固',
    '工程师：王磊',
    '待确认',
    'yellow',
  ],
  [
    'PR-CI-ABJ-20261009-003',
    '混凝土基础施工',
    '采购员：张敏',
    '已确认',
    'blue',
  ],
  ['PO-CI-ABJ-20261008-002', '厂区围栏修复', '采购员：张敏', '待收货', 'green'],
]

export function HomePage({ onOpenMaterials, onNewRequisition }: HomePageProps) {
  return (
    <>
      <section className="page-heading">
        <div>
          <h2>今日概览</h2>
          <p>采购、确认和收货待办集中在这里。</p>
        </div>
        <Button
          type="primary"
          icon={<Plus size={16} />}
          onClick={onNewRequisition}
        >
          新建采购申请
        </Button>
      </section>
      <section className="metric-grid" aria-label="采购统计">
        {[
          ['待确认', '12', '含 3 张加急'],
          ['采购进行中', '8', '已确认待下单'],
          ['待收货', '17', '含 5 次分批到货'],
          ['加急订单', '3', '需要优先处理'],
          ['本月金额', '演示', '接入订单数据后计算'],
        ].map(([label, value, note]) => (
          <article className="metric" key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
            <div className="metric-note">{note}</div>
          </article>
        ))}
      </section>
      <Card
        className="card"
        title="待处理订单"
        extra={
          <Button type="link" disabled>
            查看全部
          </Button>
        }
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>单据编号</th>
              <th>项目</th>
              <th>申请/采购人</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(([number, project, owner, status, tone]) => (
              <tr key={number}>
                <td>
                  <strong>{number}</strong>
                </td>
                <td>{project}</td>
                <td>{owner}</td>
                <td>
                  <span className={`status ${tone}`}>{status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card
        className="card"
        title="项目采购概览"
        extra={
          <Button
            type="link"
            icon={<ArrowRight size={15} />}
            iconPlacement="end"
            onClick={onOpenMaterials}
          >
            打开材料库
          </Button>
        }
      >
        <div className="project-list">
          <div className="project">
            <strong>科特迪瓦 · 阿比让仓库</strong>
            <span>4 张待确认 · 6 张待收货</span>
          </div>
          <div className="project">
            <strong>科特迪瓦 · 布瓦凯道路</strong>
            <span>5 张采购进行中</span>
          </div>
          <div className="project">
            <strong>塞内加尔 · 达喀尔厂区</strong>
            <span>3 张待确认 · 1 张加急</span>
          </div>
        </div>
      </Card>
    </>
  )
}
import { Button, Card } from 'antd'
import { ArrowRight, Plus } from 'lucide-react'
