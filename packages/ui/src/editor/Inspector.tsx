import { AiPanel } from './AiPanel';
import { Icon } from './Icon';
import { PropertiesPanel, type PropertiesProps } from './PropertiesPanel';

export type InspectorTab = 'ai' | 'properties';
export function Inspector({ activeTab, setTab, collapsed, ...properties }: PropertiesProps & {
  activeTab: InspectorTab; setTab: (tab: InspectorTab) => void; collapsed: boolean;
}) {
  const tabs: InspectorTab[] = ['ai', 'properties'];
  return <aside className={`inspector ${collapsed ? 'is-collapsed' : ''}`} aria-label="Trợ lý và thuộc tính">
    <div className="tabbar" role="tablist" aria-label="Bảng bên phải">{tabs.map((tab, i) => <button key={tab} id={`tab-${tab}`} className={`tab ${activeTab === tab ? 'active' : ''}`} role="tab" aria-selected={activeTab === tab} aria-controls={`panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => setTab(tab)} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const target = tabs[1 - i]; setTab(target); document.getElementById(`tab-${target}`)?.focus(); } }}><Icon name={tab === 'ai' ? 'sparkle' : 'settings'}/>{tab === 'ai' ? 'Trợ lý AI' : 'Thuộc tính'}</button>)}</div>
    <div id="panel-ai" className={`tabcontent ${activeTab === 'ai' ? '' : 'hidden'}`} role="tabpanel" aria-labelledby="tab-ai"><AiPanel/></div>
    <div id="panel-properties" className={`tabcontent ${activeTab === 'properties' ? '' : 'hidden'}`} role="tabpanel" aria-labelledby="tab-properties"><PropertiesPanel {...properties}/></div>
  </aside>;
}
