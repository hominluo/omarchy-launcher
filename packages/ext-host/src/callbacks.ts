// Function props become handler ids on the wire. Ids stay stable when a
// re-render replaces a prop's closure; released ids linger for two frames
// so an event already in flight from the host still finds its handler.
export class Callbacks {
  private next = 1
  private handlers = new Map<string, Function>()
  private graveyard: Set<string>[] = [new Set(), new Set()]

  register(fn: Function): string {
    const id = "h" + (this.next++)
    this.handlers.set(id, fn)
    return id
  }
  replace(id: string, fn: Function): string {
    this.handlers.set(id, fn)
    return id
  }
  has(id: string) { return this.handlers.has(id) }
  release(id: string) { this.graveyard[0].add(id) }
  // Called once per render frame: ids released two frames ago are dropped.
  tick() {
    for (const id of this.graveyard[1]) if (this.graveyard[0].has(id) || !this.handlers.has(id)) continue; else this.handlers.delete(id)
    this.graveyard = [new Set(), this.graveyard[0]]
  }
  invoke(id: string, args: any[]): any {
    const fn = this.handlers.get(id)
    if (!fn) return undefined
    return fn(...args)
  }
  clear() { this.handlers.clear(); this.graveyard = [new Set(), new Set()] }
}
