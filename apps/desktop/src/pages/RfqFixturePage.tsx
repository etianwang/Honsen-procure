import { RfqPanel } from '../components/RfqPanel'
import { tauriRfqApi, type RfqApi } from '../lib/rfq-api'

const fallbackApi: RfqApi = {
  async createRfq(input) {
    return { ...input, itemCount: 1, status: 'draft' }
  },
  async listRfqs() {
    return []
  },
  async sendRfq() {},
  async closeRfq() {},
}

export function RfqFixturePage() {
  const hasTauri = Boolean(
    (window as Window & { __TAURI__?: { core?: { invoke?: unknown } } })
      .__TAURI__?.core?.invoke,
  )
  return (
    <main className="fixture-page">
      <RfqPanel
        api={hasTauri ? tauriRfqApi : fallbackApi}
        sourceOrderId="00000000-0000-4000-8000-000000000501"
        suppliers={[
          {
            id: '00000000-0000-4000-8000-000000000502',
            name: 'fixture RFQ supplier',
          },
        ]}
      />
    </main>
  )
}
