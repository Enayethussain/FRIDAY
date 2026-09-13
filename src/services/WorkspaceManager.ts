import { hasGrantedAllScopesGoogle } from '@react-oauth/google';

class WorkspaceManager {
  private token: string | null = null;
  private scopes: string[] = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.modify'
  ];

  setToken(token: string) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }
  
  clearToken() {
    this.token = null;
  }

  getScopes(): string[] {
    return this.scopes;
  }

  private async fetchAPI(url: string, options: RequestInit = {}) {
    if (!this.token) {
      throw new Error('Not authenticated with Google Workspace');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
          this.token = null; // Clear token on auth error
      }
      const errText = await response.text();
      throw new Error(`Workspace API Error: ${response.status} - ${errText}`);
    }

    return response.json();
  }

  // --- Calendar ---
  async getUpcomingEvents(maxResults = 10) {
    const timeMin = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=${maxResults}&orderBy=startTime&singleEvents=true`;
    return this.fetchAPI(url);
  }

  async createEvent(summary: string, description: string, startTime: string, endTime: string) {
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const body = JSON.stringify({
      summary,
      description,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
    });
    return this.fetchAPI(url, { method: 'POST', body });
  }

  // --- Gmail ---
  async getRecentEmails(maxResults = 10) {
    const url = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=in:inbox`;
    const data = await this.fetchAPI(url);
    
    if (!data.messages) return [];

    const messages = await Promise.all(
      data.messages.map((msg: any) => this.fetchAPI(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`))
    );

    return messages.map((msg: any) => {
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      return {
        id: msg.id,
        snippet: msg.snippet,
        subject: getHeader('Subject'),
        from: getHeader('From'),
        date: getHeader('Date'),
      };
    });
  }
}

export const globalWorkspaceManager = new WorkspaceManager();
