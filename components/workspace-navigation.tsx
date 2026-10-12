'use client';

import {useEffect, useState} from 'react';
import {ChevronDown, Users, MapPin, ShoppingBag, Gift, BarChart3, Settings, type LucideIcon} from 'lucide-react';

const groups = [
  {id: 'team', title: 'Team & attendance', icon: Users, items: ['MR profiles', 'Team', 'Attendance', 'MR types']},
  {id: 'customers', title: 'Customers & territory', icon: MapPin, items: ['Customers', 'Customer access', 'Districts', 'Headquarters', 'Routes']},
  {id: 'field', title: 'Field work', icon: MapPin, items: ['Tour plan', 'Visits', 'Follow-ups', 'MR activity', 'Locations', 'Drafts']},
  {id: 'sales', title: 'Sales & stock', icon: ShoppingBag, items: ['Orders', 'Secondary sales', 'Primary sales', 'Stockists', 'Products', 'Stock balance']},
  {id: 'benefits', title: 'Samples & gifts', icon: Gift, items: ['Samples', 'Gifts']},
  {id: 'reports', title: 'Reports & targets', icon: BarChart3, items: ['Performance', 'Route performance', 'Reports', 'Expenses']},
  {id: 'controls', title: 'Controls & settings', icon: Settings, items: ['Approvals', 'Month closing', 'WhatsApp', 'Admin history', 'Settings']},
];
const groupFor = (tab: string) => groups.find(group => group.items.includes(tab))?.id ?? null;

type Props = {
  modules: ReadonlyArray<readonly [string, LucideIcon]>;
  tab: string;
  label: (name: string) => string;
  go: (name: string) => void;
  pendingOrders: number;
  isAdmin: boolean;
};

export function WorkspaceNavigation({modules, tab, label, go, pendingOrders, isAdmin}: Props) {
  const [expanded, setExpanded] = useState<string | null>(() => groupFor(tab));
  useEffect(() => { setExpanded(groupFor(tab)); }, [tab]);

  const renderItem = ([name, Icon]: readonly [string, LucideIcon]) => (
    <button type="button" key={name} className={tab === name ? 'active' : ''}
      onClick={() => go(name)} aria-current={tab === name ? 'page' : undefined}>
      <Icon size={18} aria-hidden="true"/><span>{label(name)}</span>
      {name === 'Orders' && pendingOrders > 0 && <b aria-label={`${pendingOrders} pending orders`}>{pendingOrders}</b>}
    </button>
  );

  return <nav className="workspace-navigation" aria-label="Main navigation">
    {modules.filter(([name]) => !groupFor(name)).map(renderItem)}
    {groups.map(group => {
      const items = group.items.flatMap(name => modules.filter(([allowed]) => allowed === name));
      if (!items.length) return null;
      const open = expanded === group.id;
      const active = items.some(([name]) => name === tab);
      const Icon = group.icon;
      const title = !isAdmin && group.id === 'team' ? 'My attendance' : !isAdmin && group.id === 'controls' ? 'Approvals & messages' : group.title;
      return <div className="nav-group" key={group.id}>
        <button type="button" className={`nav-group-toggle${active ? ' contains-active' : ''}`}
          aria-expanded={open} aria-controls={`nav-group-${group.id}`}
          onClick={() => setExpanded(open ? null : group.id)}>
          <Icon size={19} aria-hidden="true"/><span>{title}</span>
          {!open && group.id === 'sales' && pendingOrders > 0 && <b aria-label={`${pendingOrders} pending orders`}>{pendingOrders}</b>}
          <ChevronDown size={15} className="nav-group-chevron" aria-hidden="true"/>
        </button>
        <div id={`nav-group-${group.id}`} className="nav-submenu" hidden={!open}>
          {items.map(renderItem)}
        </div>
      </div>;
    })}
  </nav>;
}
