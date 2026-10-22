'use client';

import {ChevronDown} from 'lucide-react';

type DeliveryLog = {
  id: string;
  phone?: string;
  recipient?: string;
  message: string;
  subject?: string;
  status: string;
  created: string;
  error?: string;
  gateway_id?: string;
  gateway_status?: string;
  gateway_url?: string;
  checked_at?: string;
};

type LogAction = {action: 'status'; id: string} | {action: 'retry'; channel: string; id: string};

const statusLabel = (status: string) => (status || 'unknown').replaceAll('_', ' ');
function statusTone(status: string) {
  if (['delivered', 'read', 'sent'].includes(status)) return 'success';
  if (['failed', 'uncertain', 'missing_phone'].includes(status)) return 'danger';
  if (['queued', 'awaiting_setup', 'sending'].includes(status)) return 'amber';
  return 'blue';
}
function timestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return {date: 'Date unavailable', time: '', full: 'Date unavailable'};
  return {
    date: date.toLocaleDateString('en-IN', {timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric'}),
    time: date.toLocaleTimeString('en-IN', {timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit'}),
    full: date.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}) + ' IST',
  };
}

export function DeliveryLogList({logs, admin, channel, busy, onAction}: {
  logs: DeliveryLog[];
  admin: boolean;
  channel: string;
  busy: boolean;
  onAction: (payload: LogAction) => void;
}) {
  return <div className="delivery-log-list" role="region" aria-label={`${channel === 'email' ? 'Email' : 'WhatsApp'} delivery logs`}>
    <div className="delivery-log-columns" aria-hidden="true">
      <span>Recipient</span><span>Message</span><span>Status</span><span>Date / time · IST</span><span/>
    </div>
    {logs.map(log => {
      const date = timestamp(log.created);
      return <details className="message-card delivery-log-entry" key={log.id}>
        <summary>
          <b className="delivery-log-recipient">{log.phone || log.recipient || 'Recipient missing'}</b>
          <span className="delivery-log-preview no-print">{log.subject || log.message || 'No message text'}</span>
          <span className="delivery-log-status"><span className={`badge ${statusTone(log.status)}`}>{statusLabel(log.status)}</span></span>
          <span className="delivery-log-date" title={date.full}>{date.date}<small>{date.time}</small></span>
          <ChevronDown size={16} className="delivery-log-chevron" aria-hidden="true"/>
        </summary>
        <div className="delivery-log-body">
          {log.subject && <h3>{log.subject}</h3>}
          <pre>{log.message || 'No message text recorded.'}</pre>
          {log.error && <p className="delivery-log-error">{log.error}</p>}
          <dl className="delivery-log-meta">
            <div><dt>Recorded</dt><dd>{date.full}</dd></div>
            {log.gateway_id && <>
              <div><dt>Gateway ID</dt><dd>{log.gateway_id}</dd></div>
              <div><dt>Gateway status</dt><dd>{statusLabel(log.gateway_status || log.status)}</dd></div>
              {log.checked_at && <div><dt>Last checked</dt><dd>{timestamp(log.checked_at).full}</dd></div>}
            </>}
          </dl>
          <div className="field-actions">
            {admin && channel === 'whatsapp' && log.gateway_id && log.gateway_url?.endsWith('/api/v1/messages/send') &&
              <button type="button" className="secondary" disabled={busy} onClick={() => onAction({action: 'status', id: log.id})}>Check gateway status</button>}
            {admin && !log.gateway_id && ['queued', 'awaiting_setup', 'failed', 'missing_phone'].includes(log.status) &&
              <button type="button" className="secondary" disabled={busy} onClick={() => onAction({action: 'retry', channel, id: log.id})}>Retry after correction</button>}
          </div>
        </div>
      </details>;
    })}
  </div>;
}
