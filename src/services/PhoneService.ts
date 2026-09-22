import { registerPlugin } from '@capacitor/core';
import {
  ActionResult, actionFail, actionOk, classifyNativeError, withTimeout,
} from './ActionResult';

export interface PhoneContact {
  id: number;
  name: string;
  number: string;
}

export interface SmsMessage {
  address: string;
  body: string;
  date: number;
  read: boolean;
}

export interface CallLogEntry {
  number: string;
  name: string;
  type: 'incoming' | 'outgoing' | 'missed';
  date: number;
  duration: number;
}

export interface PhonePluginInterface {
  getContacts(options?: { query?: string }): Promise<{ contacts: PhoneContact[] }>;
  searchContacts(options: { query: string }): Promise<{ contacts: PhoneContact[] }>;
  makeCall(options: { number: string }): Promise<{ success: boolean; number: string; dialed?: boolean }>;
  getCallLog(options?: { limit?: number }): Promise<{ calls: CallLogEntry[] }>;
  getRecentSms(options?: { limit?: number; address?: string }): Promise<{ messages: SmsMessage[] }>;
  sendSms(options: { number: string; message: string }): Promise<{ sent?: boolean; openedComposer?: boolean; number: string; parts?: number; verified?: boolean }>;
}

const Phone = registerPlugin<PhonePluginInterface>('Phone');
const T = 8000;

export class PhoneService {
  static async searchContacts(query: string): Promise<PhoneContact[]> {
    try {
      const result = await withTimeout('contacts', query, Phone.getContacts({ query }), T);
      return result.contacts ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Initiates a real call. dialed=true means only the dialer opened
   * (user must press call) — reported honestly, never as "connected".
   */
  static async makeCall(number: string): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await withTimeout('call', number, Phone.makeCall({ number }), T);
      if (r.dialed) {
        return actionOk('call', number, 'Dialer khol diya hai — green call button dabao.', Date.now() - started, { dialed: true });
      }
      return actionOk('call', number, 'Call initiate kar diya.', Date.now() - started, { dialed: false });
    } catch (e) {
      return classifyNativeError('call', number, e, Date.now() - started);
    }
  }

  static async getCallLog(limit = 20): Promise<CallLogEntry[]> {
    try {
      const result = await withTimeout('call_log', 'log', Phone.getCallLog({ limit }), T);
      return result.calls ?? [];
    } catch {
      return [];
    }
  }

  static async getRecentSms(limit = 20, address?: string): Promise<SmsMessage[]> {
    try {
      const result = await withTimeout('read_sms', address ?? 'sms', Phone.getRecentSms({ limit, address }), T);
      return result.messages ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Real SMS: sent=true only after carrier confirmation (native sent-intent).
   * openedComposer=true means the SMS app opened pre-filled — user sends it.
   */
  static async sendSms(number: string, message: string): Promise<ActionResult> {
    const started = Date.now();
    try {
      const r = await withTimeout('sms', number, Phone.sendSms({ number, message }), 25000);
      if (r.sent) return actionOk('sms', number, 'Message bhej diya.', Date.now() - started);
      if (r.openedComposer) {
        return actionFail('NOT_SUPPORTED', 'sms', number,
          'Direct SMS permission nahi hai. SMS app me message likh diya hai — send dabana hoga.', Date.now() - started);
      }
      return actionFail('FAILED', 'sms', number, 'Message bhejne me fail hua.', Date.now() - started);
    } catch (e) {
      return classifyNativeError('sms', number, e, Date.now() - started);
    }
  }

  static async findContact(name: string): Promise<PhoneContact | null> {
    const contacts = await this.searchContacts(name);
    if (contacts.length === 0) return null;
    const exact = contacts.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact;
    return contacts[0];
  }

  static async findContactOrReject(name: string): Promise<PhoneContact> {
    const contacts = await this.searchContacts(name);
    if (contacts.length === 0) throw new Error(`Contact "${name}" not found`);
    if (contacts.length === 1) return contacts[0];
    const exact = contacts.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact;
    throw new Error(`Multiple contacts found for "${name}": ${contacts.map(c => c.name).join(', ')}`);
  }
}
