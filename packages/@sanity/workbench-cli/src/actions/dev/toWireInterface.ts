import {type DevServerInterface} from './deriveConfigs.js'

// The registry stores view interfaces discriminated on `surface` (the author
// API's word), but the workbench remote — like the deployed application record
// (see viewDeployment.ts) — keys every interface on `type`. This module is the
// single, strictly-typed boundary that converts the internal `surface` shape to
// the wire `type` shape for local dev, so the two can never drift again: the
// return type carries no `surface`, so a raw registry interface cannot be sent
// to the remote without passing through here.

/** A registry view interface — the members discriminated on `surface`. */
type ViewInterface = Extract<DevServerInterface, {surface: unknown}>
/** A registry worker interface — already keyed on `type`. */
type WorkerInterface = Extract<DevServerInterface, {type: unknown}>

/** A local interface keyed on the type Brett returns. @internal */
export type WorkbenchWireInterface =
  | (Omit<ViewInterface, 'surface'> & {
      type: 'app' | Exclude<ViewInterface['surface'], 'window'>
    })
  | WorkerInterface

/** Maps local view surfaces to Brett interface types. @internal */
export function toWireInterface(iface: DevServerInterface): WorkbenchWireInterface {
  if ('surface' in iface) {
    const {surface, ...rest} = iface
    return {...rest, type: surface === 'window' ? 'app' : surface}
  }
  return iface
}
