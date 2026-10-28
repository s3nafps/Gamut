import type { ServerResponse } from 'node:http';

/** Server-Sent Events: tells every open screen that data changed, so it refreshes. */
export class LiveHub {
  private clients = new Set<ServerResponse>();
  private heartbeat: NodeJS.Timeout;

  constructor() {
    this.heartbeat = setInterval(() => this.send(': ping\n\n'), 25_000);
    this.heartbeat.unref();
  }

  add(res: ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  broadcast(topic: string) {
    this.send(`event: changed\ndata: ${JSON.stringify({ topic, at: Date.now() })}\n\n`);
  }

  private send(chunk: string) {
    for (const c of this.clients) c.write(chunk);
  }

  close() {
    clearInterval(this.heartbeat);
    for (const c of this.clients) c.end();
    this.clients.clear();
  }
}
