// // // import { useIsMobile } from '../hooks/useIsMobile'

// // // import { Home, LayoutGrid, Inbox, Plus, BarChart3 } from 'lucide-react'

// // // type Page = 'home' | 'pipeline' | 'triage' | 'capture'

// // // interface Props {
// // //   current: Page
// // //   navigate: (page: Page) => void
// // //   onPartnerPortal: () => void
// // // }



// // // const NAV_ITEMS = [
// // //   { id: 'home'     as Page, label: 'Home',         icon: Home        },
// // //   { id: 'pipeline' as Page, label: 'Pipeline',     icon: LayoutGrid  },
// // //   { id: 'triage'   as Page, label: 'Triage queue', icon: Inbox       },
// // //   { id: 'capture'  as Page, label: 'Capture lead', icon: Plus        },
// // // ]

// // // export default function Sidebar({ current, navigate, onPartnerPortal }: Props) {
// // //   const isMobile = useIsMobile()

// // //   // Mobile — bottom nav bar
// // //   if (isMobile) {
// // //     return (
// // //       <nav style={{
// // //         position: 'fixed', bottom: 0, left: 0, right: 0,
// // //         backgroundColor: '#fff',
// // //         borderTop: '1px solid #DDD7C6',
// // //         display: 'flex',
// // //         zIndex: 40,
// // //         paddingBottom: 'env(safe-area-inset-bottom)',
// // //       }}>
// // //         {NAV_ITEMS.map(item => {
// // //           const Icon = item.icon
// // //           const active = current === item.id
// // //           return (
// // //             <button
// // //               key={item.id}
// // //               onClick={() => navigate(item.id)}
// // //               style={{
// // //                 flex: 1,
// // //                 display: 'flex', flexDirection: 'column',
// // //                 alignItems: 'center', gap: 3,
// // //                 padding: '10px 4px 8px',
// // //                 background: 'none', border: 'none',
// // //                 cursor: 'pointer',
// // //                 color: active ? '#0E5550' : '#6A675F',
// // //                 position: 'relative',
// // //               }}
// // //             >
// // //               {active && (
// // //                 <div style={{
// // //                   position: 'absolute', top: 0, left: '20%', right: '20%',
// // //                   height: 2, backgroundColor: '#0E5550',
// // //                   borderRadius: '0 0 2px 2px',
// // //                 }} />
// // //               )}
// // //               <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
// // //               <span style={{
// // //                 fontSize: 10, fontWeight: active ? 700 : 500,
// // //                 letterSpacing: '0.01em',
// // //               }}>
// // //                 {item.label}
// // //               </span>
// // //             </button>
// // //           )
// // //         })}
// // //       </nav>
// // //     )
// // //   }

// // //   // Desktop — sidebar
// // //   return (
// // //     <aside style={{
// // //       width: 232,
// // //       backgroundColor: '#EDE7D8',
// // //       borderRight: '1px solid #DDD7C6',
// // //       display: 'flex', flexDirection: 'column',
// // //       padding: '22px 12px 16px',
// // //       flexShrink: 0,
// // //     }}>
// // //       {/* Logo */}
// // //       <div style={{ padding: '0 6px 24px' }}>
// // //         <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
// // //           <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em' }}>SGT</span>
// // //           <span style={{ fontSize: 15, fontWeight: 500, color: '#0E5550', letterSpacing: '-0.02em' }}>HydroEdge</span>
// // //         </div>
// // //         <div style={{ fontSize: 10, color: '#6A675F', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
// // //           Lead Service · v1
// // //         </div>
// // //       </div>

// // //       {/* Nav */}
// // //       <nav style={{ flex: 1 }}>
// // //         <p style={{ fontSize: 10, color: '#6A675F', padding: '0 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
// // //           Workspace
// // //         </p>
// // //         {NAV_ITEMS.map(item => {
// // //           const Icon = item.icon
// // //           const active = current === item.id
// // //           return (
// // //             <button
// // //               key={item.id}
// // //               onClick={() => navigate(item.id)}
// // //               style={{
// // //                 width: '100%', display: 'flex', alignItems: 'center', gap: 10,
// // //                 padding: '8px 9px', borderRadius: 5,
// // //                 backgroundColor: active ? '#fff' : 'transparent',
// // //                 color: active ? '#161614' : '#363633',
// // //                 fontSize: 13, fontWeight: active ? 600 : 500,
// // //                 textAlign: 'left', cursor: 'pointer', border: 'none',
// // //                 marginBottom: 1, position: 'relative',
// // //               }}
// // //             >
// // //               {active && (
// // //                 <div style={{
// // //                   position: 'absolute', left: 0, top: 6, bottom: 6,
// // //                   width: 2.5, backgroundColor: '#0E5550', borderRadius: 2,
// // //                 }} />
// // //               )}
// // //               <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
// // //               {item.label}
// // //             </button>
// // //           )
// // //         })}

// // //         <button
// // //           onClick={onPartnerPortal}
// // //           style={{
// // //             margin: '8px 0', padding: '10px 12px',
// // //             backgroundColor: '#fff', border: '1px solid #DDD7C6',
// // //             borderRadius: 6, cursor: 'pointer',
// // //             display: 'flex', alignItems: 'center', gap: 10, width: '100%',
// // //             textAlign: 'left',
// // //           }}
// // //         >
// // //           <div style={{
// // //             width: 28, height: 28, borderRadius: 6,
// // //             backgroundColor: '#F5E0CC', color: '#6F2F0E',
// // //             display: 'flex', alignItems: 'center', justifyContent: 'center',
// // //             fontSize: 14,
// // //           }}>↗</div>
// // //           <div>
// // //             <div style={{ fontSize: 12, fontWeight: 600, color: '#161614' }}>Partner Portal</div>
// // //             <div style={{ fontSize: 10.5, color: '#6A675F', marginTop: 1 }}>See partner-side view</div>
// // //           </div>
// // //         </button>

// // //         <p style={{ fontSize: 10, color: '#A39F94', padding: '20px 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
// // //           Phase 2
// // //         </p>
// // //         <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', color: '#A39F94', fontSize: 13, cursor: 'not-allowed' }}>
// // //           <BarChart3 size={15} strokeWidth={1.5} />
// // //           Reports
// // //         </div>
// // //       </nav>

// // //       {/* User */}
// // //       <div style={{ padding: '12px 8px', borderTop: '1px solid #DDD7C6', display: 'flex', alignItems: 'center', gap: 10 }}>
// // //         <div style={{
// // //           width: 30, height: 30, borderRadius: '50%',
// // //           backgroundColor: '#1E3A6B', color: '#fff',
// // //           display: 'flex', alignItems: 'center', justifyContent: 'center',
// // //           fontSize: 11.5, fontWeight: 600,
// // //         }}>RM</div>
// // //         <div>
// // //           <div style={{ fontSize: 12.5, fontWeight: 600 }}>Rohan Mehta</div>
// // //           <div style={{ fontSize: 10.5, color: '#6A675F' }}>Sales · Industry</div>
// // //         </div>
// // //       </div>
// // //     </aside>
// // //   )
// // // }
// // import { useIsMobile } from '../hooks/useIsMobile'

// // import { LayoutGrid, Inbox, Plus, BarChart3, Handshake, LayoutDashboard, User } from 'lucide-react'

// // type Page = 'home' | 'my-dashboard' | 'pipeline' | 'triage' | 'capture'

// // interface Props {
// //   current: Page
// //   navigate: (page: Page) => void
// //   role: string
// //   userName: string
// //   onLogout: () => void
// //   onPartnerPortal: () => void
// // }


// // const NAV_ITEMS = [
// //   { id: 'home'         as Page, label: 'Director view', short: 'Director', icon: LayoutDashboard },
// //   { id: 'my-dashboard' as Page, label: 'My dashboard',  short: 'My view',  icon: User          },
// //   { id: 'pipeline'     as Page, label: 'Pipeline',      short: 'Pipeline', icon: LayoutGrid    },
// //   { id: 'triage'       as Page, label: 'Triage queue',  short: 'Triage',   icon: Inbox         },
// //   { id: 'capture'      as Page, label: 'Capture lead',  short: 'Capture',  icon: Plus          },
// // ]

// // export default function Sidebar({ current, navigate, onPartnerPortal }: Props) {
// //   const isMobile = useIsMobile()

// //   // Mobile — bottom nav bar
// //   if (isMobile) {
// //     return (
// //       <nav style={{
// //         position: 'fixed', bottom: 0, left: 0, right: 0,
// //         backgroundColor: '#fff',
// //         borderTop: '1px solid #DDD7C6',
// //         display: 'flex',
// //         zIndex: 40,
// //         paddingBottom: 'env(safe-area-inset-bottom)',
// //       }}>
// //         {NAV_ITEMS.map(item => {
// //           const Icon = item.icon
// //           const active = current === item.id
// //           return (
// //             <button
// //               key={item.id}
// //               onClick={() => navigate(item.id)}
// //               style={{
// //                 flex: 1,
// //                 display: 'flex', flexDirection: 'column',
// //                 alignItems: 'center', gap: 3,
// //                 padding: '10px 2px 8px',
// //                 background: 'none', border: 'none',
// //                 cursor: 'pointer',
// //                 color: active ? '#0E5550' : '#6A675F',
// //                 position: 'relative',
// //               }}
// //             >
// //               {active && (
// //                 <div style={{
// //                   position: 'absolute', top: 0, left: '20%', right: '20%',
// //                   height: 2, backgroundColor: '#0E5550',
// //                   borderRadius: '0 0 2px 2px',
// //                 }} />
// //               )}
// //               <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
// //               <span style={{
// //                 fontSize: 10, fontWeight: active ? 700 : 500,
// //                 letterSpacing: '0.01em',
// //               }}>
// //                 {item.short}
// //               </span>
// //             </button>
// //           )
// //         })}

// //         {/* Partner Portal — separate mode, not a page */}
// //         <button
// //           onClick={onPartnerPortal}
// //           style={{
// //             flex: 1,
// //             display: 'flex', flexDirection: 'column',
// //             alignItems: 'center', gap: 3,
// //             padding: '10px 2px 8px',
// //             background: 'none', border: 'none',
// //             cursor: 'pointer',
// //             color: '#6F2F0E',
// //             position: 'relative',
// //           }}
// //         >
// //           <Handshake size={20} strokeWidth={1.75} />
// //           <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.01em' }}>
// //             Partner
// //           </span>
// //         </button>
// //       </nav>
// //     )
// //   }

// //   // Desktop — sidebar
// //   return (
// //     <aside style={{
// //       width: 232,
// //       backgroundColor: '#EDE7D8',
// //       borderRight: '1px solid #DDD7C6',
// //       display: 'flex', flexDirection: 'column',
// //       padding: '22px 12px 16px',
// //       flexShrink: 0,
// //     }}>
// //       {/* Logo */}
// //       <div style={{ padding: '0 6px 24px' }}>
// //         <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
// //           <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em' }}>SGT</span>
// //           <span style={{ fontSize: 15, fontWeight: 500, color: '#0E5550', letterSpacing: '-0.02em' }}>HydroEdge</span>
// //         </div>
// //         <div style={{ fontSize: 10, color: '#6A675F', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
// //           Lead Service · v1
// //         </div>
// //       </div>

// //       {/* Nav */}
// //       <nav style={{ flex: 1 }}>
// //         <p style={{ fontSize: 10, color: '#6A675F', padding: '0 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
// //           Workspace
// //         </p>
// //         {NAV_ITEMS.map(item => {
// //           const Icon = item.icon
// //           const active = current === item.id
// //           return (
// //             <button
// //               key={item.id}
// //               onClick={() => navigate(item.id)}
// //               style={{
// //                 width: '100%', display: 'flex', alignItems: 'center', gap: 10,
// //                 padding: '8px 9px', borderRadius: 5,
// //                 backgroundColor: active ? '#fff' : 'transparent',
// //                 color: active ? '#161614' : '#363633',
// //                 fontSize: 13, fontWeight: active ? 600 : 500,
// //                 textAlign: 'left', cursor: 'pointer', border: 'none',
// //                 marginBottom: 1, position: 'relative',
// //               }}
// //             >
// //               {active && (
// //                 <div style={{
// //                   position: 'absolute', left: 0, top: 6, bottom: 6,
// //                   width: 2.5, backgroundColor: '#0E5550', borderRadius: 2,
// //                 }} />
// //               )}
// //               <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
// //               {item.label}
// //             </button>
// //           )
// //         })}

// //         <button
// //           onClick={onPartnerPortal}
// //           style={{
// //             margin: '8px 0', padding: '10px 12px',
// //             backgroundColor: '#fff', border: '1px solid #DDD7C6',
// //             borderRadius: 6, cursor: 'pointer',
// //             display: 'flex', alignItems: 'center', gap: 10, width: '100%',
// //             textAlign: 'left',
// //           }}
// //         >
// //           <div style={{
// //             width: 28, height: 28, borderRadius: 6,
// //             backgroundColor: '#F5E0CC', color: '#6F2F0E',
// //             display: 'flex', alignItems: 'center', justifyContent: 'center',
// //             fontSize: 14,
// //           }}>↗</div>
// //           <div>
// //             <div style={{ fontSize: 12, fontWeight: 600, color: '#161614' }}>Partner Portal</div>
// //             <div style={{ fontSize: 10.5, color: '#6A675F', marginTop: 1 }}>See partner-side view</div>
// //           </div>
// //         </button>

// //         <p style={{ fontSize: 10, color: '#A39F94', padding: '20px 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
// //           Phase 2
// //         </p>
// //         <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', color: '#A39F94', fontSize: 13, cursor: 'not-allowed' }}>
// //           <BarChart3 size={15} strokeWidth={1.5} />
// //           Reports
// //         </div>
// //       </nav>

// //       {/* User */}
// //       <div style={{ padding: '12px 8px', borderTop: '1px solid #DDD7C6', display: 'flex', alignItems: 'center', gap: 10 }}>
// //         <div style={{
// //           width: 30, height: 30, borderRadius: '50%',
// //           backgroundColor: '#1E3A6B', color: '#fff',
// //           display: 'flex', alignItems: 'center', justifyContent: 'center',
// //           fontSize: 11.5, fontWeight: 600,
// //         }}>RM</div>
// //         <div>
// //           <div style={{ fontSize: 12.5, fontWeight: 600 }}>Rohan Mehta</div>
// //           <div style={{ fontSize: 10.5, color: '#6A675F' }}>Sales · Industry</div>
// //         </div>
// //       </div>
// //     </aside>
// //   )
// // }
// import { useIsMobile } from '../hooks/useIsMobile'
// import { LayoutGrid, Inbox, Plus, BarChart3, LayoutDashboard, User, Handshake, LogOut } from 'lucide-react'

// type Page = 'home' | 'my-dashboard' | 'pipeline' | 'triage' | 'capture'

// interface Props {
//   current: Page
//   navigate: (page: Page) => void
//   role: string
//   userName: string
//   onLogout: () => void
//   onPartnerPortal: () => void
// }

// interface NavItem {
//   id: Page
//   label: string
//   short: string
//   icon: typeof LayoutGrid
//   /** If set, only these roles see the item. */
//   roles?: string[]
// }

// const NAV_ITEMS: NavItem[] = [
//   { id: 'home',         label: 'Director view', short: 'Director', icon: LayoutDashboard, roles: ['director'] },
//   { id: 'my-dashboard', label: 'My dashboard',  short: 'My view',  icon: User          },
//   { id: 'pipeline',     label: 'Pipeline',      short: 'Pipeline', icon: LayoutGrid    },
//   { id: 'triage',       label: 'Triage queue',  short: 'Triage',   icon: Inbox         },
//   { id: 'capture',      label: 'Capture lead',  short: 'Capture',  icon: Plus          },
// ]

// function initials(name: string): string {
//   return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?'
// }

// function roleLabel(role: string): string {
//   if (role === 'director') return 'Director'
//   if (role === 'sales') return 'Sales'
//   return role.charAt(0).toUpperCase() + role.slice(1)
// }

// export default function Sidebar({ current, navigate, role, userName, onLogout, onPartnerPortal }: Props) {
//   const isMobile = useIsMobile()

//   // Only show nav items this role is allowed to see
//   const items = NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role))

//   // Mobile — bottom nav bar
//   if (isMobile) {
//     return (
//       <nav style={{
//         position: 'fixed', bottom: 0, left: 0, right: 0,
//         backgroundColor: '#fff',
//         borderTop: '1px solid #DDD7C6',
//         display: 'flex',
//         zIndex: 40,
//         paddingBottom: 'env(safe-area-inset-bottom)',
//       }}>
//         {items.map(item => {
//           const Icon = item.icon
//           const active = current === item.id
//           return (
//             <button
//               key={item.id}
//               onClick={() => navigate(item.id)}
//               style={{
//                 flex: 1,
//                 display: 'flex', flexDirection: 'column',
//                 alignItems: 'center', gap: 3,
//                 padding: '10px 2px 8px',
//                 background: 'none', border: 'none',
//                 cursor: 'pointer',
//                 color: active ? '#0E5550' : '#6A675F',
//                 position: 'relative',
//               }}
//             >
//               {active && (
//                 <div style={{
//                   position: 'absolute', top: 0, left: '20%', right: '20%',
//                   height: 2, backgroundColor: '#0E5550',
//                   borderRadius: '0 0 2px 2px',
//                 }} />
//               )}
//               <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
//               <span style={{
//                 fontSize: 10, fontWeight: active ? 700 : 500,
//                 letterSpacing: '0.01em',
//               }}>
//                 {item.short}
//               </span>
//             </button>
//           )
//         })}

//         {/* Partner Portal — separate mode, not a page */}
//         <button
//           onClick={onPartnerPortal}
//           style={{
//             flex: 1,
//             display: 'flex', flexDirection: 'column',
//             alignItems: 'center', gap: 3,
//             padding: '10px 2px 8px',
//             background: 'none', border: 'none',
//             cursor: 'pointer',
//             color: '#6F2F0E',
//             position: 'relative',
//           }}
//         >
//           <Handshake size={20} strokeWidth={1.75} />
//           <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.01em' }}>
//             Partner
//           </span>
//         </button>
//       </nav>
//     )
//   }

//   // Desktop — sidebar
//   return (
//     <aside style={{
//       width: 232,
//       backgroundColor: '#EDE7D8',
//       borderRight: '1px solid #DDD7C6',
//       display: 'flex', flexDirection: 'column',
//       padding: '22px 12px 16px',
//       flexShrink: 0,
//     }}>
//       {/* Logo */}
//       <div style={{ padding: '0 6px 24px' }}>
//         <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
//           <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em' }}>SGT</span>
//           <span style={{ fontSize: 15, fontWeight: 500, color: '#0E5550', letterSpacing: '-0.02em' }}>HydroEdge</span>
//         </div>
//         <div style={{ fontSize: 10, color: '#6A675F', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
//           Lead Service · v1
//         </div>
//       </div>

//       {/* Nav */}
//       <nav style={{ flex: 1 }}>
//         <p style={{ fontSize: 10, color: '#6A675F', padding: '0 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
//           Workspace
//         </p>
//         {items.map(item => {
//           const Icon = item.icon
//           const active = current === item.id
//           return (
//             <button
//               key={item.id}
//               onClick={() => navigate(item.id)}
//               style={{
//                 width: '100%', display: 'flex', alignItems: 'center', gap: 10,
//                 padding: '8px 9px', borderRadius: 5,
//                 backgroundColor: active ? '#fff' : 'transparent',
//                 color: active ? '#161614' : '#363633',
//                 fontSize: 13, fontWeight: active ? 600 : 500,
//                 textAlign: 'left', cursor: 'pointer', border: 'none',
//                 marginBottom: 1, position: 'relative',
//               }}
//             >
//               {active && (
//                 <div style={{
//                   position: 'absolute', left: 0, top: 6, bottom: 6,
//                   width: 2.5, backgroundColor: '#0E5550', borderRadius: 2,
//                 }} />
//               )}
//               <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
//               {item.label}
//             </button>
//           )
//         })}

//         <button
//           onClick={onPartnerPortal}
//           style={{
//             margin: '8px 0', padding: '10px 12px',
//             backgroundColor: '#fff', border: '1px solid #DDD7C6',
//             borderRadius: 6, cursor: 'pointer',
//             display: 'flex', alignItems: 'center', gap: 10, width: '100%',
//             textAlign: 'left',
//           }}
//         >
//           <div style={{
//             width: 28, height: 28, borderRadius: 6,
//             backgroundColor: '#F5E0CC', color: '#6F2F0E',
//             display: 'flex', alignItems: 'center', justifyContent: 'center',
//             fontSize: 14,
//           }}>↗</div>
//           <div>
//             <div style={{ fontSize: 12, fontWeight: 600, color: '#161614' }}>Partner Portal</div>
//             <div style={{ fontSize: 10.5, color: '#6A675F', marginTop: 1 }}>See partner-side view</div>
//           </div>
//         </button>

//         <p style={{ fontSize: 10, color: '#A39F94', padding: '20px 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
//           Phase 2
//         </p>
//         <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', color: '#A39F94', fontSize: 13, cursor: 'not-allowed' }}>
//           <BarChart3 size={15} strokeWidth={1.5} />
//           Reports
//         </div>
//       </nav>

//       {/* User — logged-in account */}
//       <div style={{ padding: '12px 8px 0', borderTop: '1px solid #DDD7C6', display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{
//           width: 30, height: 30, borderRadius: '50%',
//           backgroundColor: '#1E3A6B', color: '#fff',
//           display: 'flex', alignItems: 'center', justifyContent: 'center',
//           fontSize: 11.5, fontWeight: 600, flexShrink: 0,
//         }}>
//           {initials(userName)}
//         </div>
//         <div style={{ flex: 1, minWidth: 0 }}>
//           <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
//             {userName}
//           </div>
//           <div style={{ fontSize: 10.5, color: '#6A675F' }}>{roleLabel(role)}</div>
//         </div>
//         <button
//           onClick={onLogout}
//           title="Log out"
//           style={{
//             background: 'none', border: 'none', cursor: 'pointer',
//             color: '#6A675F', padding: 4, display: 'flex', flexShrink: 0,
//           }}
//         >
//           <LogOut size={15} strokeWidth={2} />
//         </button>
//       </div>
//     </aside>
//   )
// }
// // import { useIsMobile } from '../hooks/useIsMobile'

// // import { Home, LayoutGrid, Inbox, Plus, BarChart3 } from 'lucide-react'

// // type Page = 'home' | 'pipeline' | 'triage' | 'capture'

// // interface Props {
// //   current: Page
// //   navigate: (page: Page) => void
// //   onPartnerPortal: () => void
// // }



// // const NAV_ITEMS = [
// //   { id: 'home'     as Page, label: 'Home',         icon: Home        },
// //   { id: 'pipeline' as Page, label: 'Pipeline',     icon: LayoutGrid  },
// //   { id: 'triage'   as Page, label: 'Triage queue', icon: Inbox       },
// //   { id: 'capture'  as Page, label: 'Capture lead', icon: Plus        },
// // ]

// // export default function Sidebar({ current, navigate, onPartnerPortal }: Props) {
// //   const isMobile = useIsMobile()

// //   // Mobile — bottom nav bar
// //   if (isMobile) {
// //     return (
// //       <nav style={{
// //         position: 'fixed', bottom: 0, left: 0, right: 0,
// //         backgroundColor: '#fff',
// //         borderTop: '1px solid #DDD7C6',
// //         display: 'flex',
// //         zIndex: 40,
// //         paddingBottom: 'env(safe-area-inset-bottom)',
// //       }}>
// //         {NAV_ITEMS.map(item => {
// //           const Icon = item.icon
// //           const active = current === item.id
// //           return (
// //             <button
// //               key={item.id}
// //               onClick={() => navigate(item.id)}
// //               style={{
// //                 flex: 1,
// //                 display: 'flex', flexDirection: 'column',
// //                 alignItems: 'center', gap: 3,
// //                 padding: '10px 4px 8px',
// //                 background: 'none', border: 'none',
// //                 cursor: 'pointer',
// //                 color: active ? '#0E5550' : '#6A675F',
// //                 position: 'relative',
// //               }}
// //             >
// //               {active && (
// //                 <div style={{
// //                   position: 'absolute', top: 0, left: '20%', right: '20%',
// //                   height: 2, backgroundColor: '#0E5550',
// //                   borderRadius: '0 0 2px 2px',
// //                 }} />
// //               )}
// //               <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
// //               <span style={{
// //                 fontSize: 10, fontWeight: active ? 700 : 500,
// //                 letterSpacing: '0.01em',
// //               }}>
// //                 {item.label}
// //               </span>
// //             </button>
// //           )
// //         })}
// //       </nav>
// //     )
// //   }

// //   // Desktop — sidebar
// //   return (
// //     <aside style={{
// //       width: 232,
// //       backgroundColor: '#EDE7D8',
// //       borderRight: '1px solid #DDD7C6',
// //       display: 'flex', flexDirection: 'column',
// //       padding: '22px 12px 16px',
// //       flexShrink: 0,
// //     }}>
// //       {/* Logo */}
// //       <div style={{ padding: '0 6px 24px' }}>
// //         <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
// //           <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em' }}>SGT</span>
// //           <span style={{ fontSize: 15, fontWeight: 500, color: '#0E5550', letterSpacing: '-0.02em' }}>HydroEdge</span>
// //         </div>
// //         <div style={{ fontSize: 10, color: '#6A675F', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
// //           Lead Service · v1
// //         </div>
// //       </div>

// //       {/* Nav */}
// //       <nav style={{ flex: 1 }}>
// //         <p style={{ fontSize: 10, color: '#6A675F', padding: '0 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
// //           Workspace
// //         </p>
// //         {NAV_ITEMS.map(item => {
// //           const Icon = item.icon
// //           const active = current === item.id
// //           return (
// //             <button
// //               key={item.id}
// //               onClick={() => navigate(item.id)}
// //               style={{
// //                 width: '100%', display: 'flex', alignItems: 'center', gap: 10,
// //                 padding: '8px 9px', borderRadius: 5,
// //                 backgroundColor: active ? '#fff' : 'transparent',
// //                 color: active ? '#161614' : '#363633',
// //                 fontSize: 13, fontWeight: active ? 600 : 500,
// //                 textAlign: 'left', cursor: 'pointer', border: 'none',
// //                 marginBottom: 1, position: 'relative',
// //               }}
// //             >
// //               {active && (
// //                 <div style={{
// //                   position: 'absolute', left: 0, top: 6, bottom: 6,
// //                   width: 2.5, backgroundColor: '#0E5550', borderRadius: 2,
// //                 }} />
// //               )}
// //               <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
// //               {item.label}
// //             </button>
// //           )
// //         })}

// //         <button
// //           onClick={onPartnerPortal}
// //           style={{
// //             margin: '8px 0', padding: '10px 12px',
// //             backgroundColor: '#fff', border: '1px solid #DDD7C6',
// //             borderRadius: 6, cursor: 'pointer',
// //             display: 'flex', alignItems: 'center', gap: 10, width: '100%',
// //             textAlign: 'left',
// //           }}
// //         >
// //           <div style={{
// //             width: 28, height: 28, borderRadius: 6,
// //             backgroundColor: '#F5E0CC', color: '#6F2F0E',
// //             display: 'flex', alignItems: 'center', justifyContent: 'center',
// //             fontSize: 14,
// //           }}>↗</div>
// //           <div>
// //             <div style={{ fontSize: 12, fontWeight: 600, color: '#161614' }}>Partner Portal</div>
// //             <div style={{ fontSize: 10.5, color: '#6A675F', marginTop: 1 }}>See partner-side view</div>
// //           </div>
// //         </button>

// //         <p style={{ fontSize: 10, color: '#A39F94', padding: '20px 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
// //           Phase 2
// //         </p>
// //         <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', color: '#A39F94', fontSize: 13, cursor: 'not-allowed' }}>
// //           <BarChart3 size={15} strokeWidth={1.5} />
// //           Reports
// //         </div>
// //       </nav>

// //       {/* User */}
// //       <div style={{ padding: '12px 8px', borderTop: '1px solid #DDD7C6', display: 'flex', alignItems: 'center', gap: 10 }}>
// //         <div style={{
// //           width: 30, height: 30, borderRadius: '50%',
// //           backgroundColor: '#1E3A6B', color: '#fff',
// //           display: 'flex', alignItems: 'center', justifyContent: 'center',
// //           fontSize: 11.5, fontWeight: 600,
// //         }}>RM</div>
// //         <div>
// //           <div style={{ fontSize: 12.5, fontWeight: 600 }}>Rohan Mehta</div>
// //           <div style={{ fontSize: 10.5, color: '#6A675F' }}>Sales · Industry</div>
// //         </div>
// //       </div>
// //     </aside>
// //   )
// // }
// import { useIsMobile } from '../hooks/useIsMobile'

// import { LayoutGrid, Inbox, Plus, BarChart3, Handshake, LayoutDashboard, User } from 'lucide-react'

// type Page = 'home' | 'my-dashboard' | 'pipeline' | 'triage' | 'capture'

// interface Props {
//   current: Page
//   navigate: (page: Page) => void
//   role: string
//   userName: string
//   onLogout: () => void
//   onPartnerPortal: () => void
// }


// const NAV_ITEMS = [
//   { id: 'home'         as Page, label: 'Director view', short: 'Director', icon: LayoutDashboard },
//   { id: 'my-dashboard' as Page, label: 'My dashboard',  short: 'My view',  icon: User          },
//   { id: 'pipeline'     as Page, label: 'Pipeline',      short: 'Pipeline', icon: LayoutGrid    },
//   { id: 'triage'       as Page, label: 'Triage queue',  short: 'Triage',   icon: Inbox         },
//   { id: 'capture'      as Page, label: 'Capture lead',  short: 'Capture',  icon: Plus          },
// ]

// export default function Sidebar({ current, navigate, onPartnerPortal }: Props) {
//   const isMobile = useIsMobile()

//   // Mobile — bottom nav bar
//   if (isMobile) {
//     return (
//       <nav style={{
//         position: 'fixed', bottom: 0, left: 0, right: 0,
//         backgroundColor: '#fff',
//         borderTop: '1px solid #DDD7C6',
//         display: 'flex',
//         zIndex: 40,
//         paddingBottom: 'env(safe-area-inset-bottom)',
//       }}>
//         {NAV_ITEMS.map(item => {
//           const Icon = item.icon
//           const active = current === item.id
//           return (
//             <button
//               key={item.id}
//               onClick={() => navigate(item.id)}
//               style={{
//                 flex: 1,
//                 display: 'flex', flexDirection: 'column',
//                 alignItems: 'center', gap: 3,
//                 padding: '10px 2px 8px',
//                 background: 'none', border: 'none',
//                 cursor: 'pointer',
//                 color: active ? '#0E5550' : '#6A675F',
//                 position: 'relative',
//               }}
//             >
//               {active && (
//                 <div style={{
//                   position: 'absolute', top: 0, left: '20%', right: '20%',
//                   height: 2, backgroundColor: '#0E5550',
//                   borderRadius: '0 0 2px 2px',
//                 }} />
//               )}
//               <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
//               <span style={{
//                 fontSize: 10, fontWeight: active ? 700 : 500,
//                 letterSpacing: '0.01em',
//               }}>
//                 {item.short}
//               </span>
//             </button>
//           )
//         })}

//         {/* Partner Portal — separate mode, not a page */}
//         <button
//           onClick={onPartnerPortal}
//           style={{
//             flex: 1,
//             display: 'flex', flexDirection: 'column',
//             alignItems: 'center', gap: 3,
//             padding: '10px 2px 8px',
//             background: 'none', border: 'none',
//             cursor: 'pointer',
//             color: '#6F2F0E',
//             position: 'relative',
//           }}
//         >
//           <Handshake size={20} strokeWidth={1.75} />
//           <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.01em' }}>
//             Partner
//           </span>
//         </button>
//       </nav>
//     )
//   }

//   // Desktop — sidebar
//   return (
//     <aside style={{
//       width: 232,
//       backgroundColor: '#EDE7D8',
//       borderRight: '1px solid #DDD7C6',
//       display: 'flex', flexDirection: 'column',
//       padding: '22px 12px 16px',
//       flexShrink: 0,
//     }}>
//       {/* Logo */}
//       <div style={{ padding: '0 6px 24px' }}>
//         <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
//           <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em' }}>SGT</span>
//           <span style={{ fontSize: 15, fontWeight: 500, color: '#0E5550', letterSpacing: '-0.02em' }}>HydroEdge</span>
//         </div>
//         <div style={{ fontSize: 10, color: '#6A675F', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
//           Lead Service · v1
//         </div>
//       </div>

//       {/* Nav */}
//       <nav style={{ flex: 1 }}>
//         <p style={{ fontSize: 10, color: '#6A675F', padding: '0 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
//           Workspace
//         </p>
//         {NAV_ITEMS.map(item => {
//           const Icon = item.icon
//           const active = current === item.id
//           return (
//             <button
//               key={item.id}
//               onClick={() => navigate(item.id)}
//               style={{
//                 width: '100%', display: 'flex', alignItems: 'center', gap: 10,
//                 padding: '8px 9px', borderRadius: 5,
//                 backgroundColor: active ? '#fff' : 'transparent',
//                 color: active ? '#161614' : '#363633',
//                 fontSize: 13, fontWeight: active ? 600 : 500,
//                 textAlign: 'left', cursor: 'pointer', border: 'none',
//                 marginBottom: 1, position: 'relative',
//               }}
//             >
//               {active && (
//                 <div style={{
//                   position: 'absolute', left: 0, top: 6, bottom: 6,
//                   width: 2.5, backgroundColor: '#0E5550', borderRadius: 2,
//                 }} />
//               )}
//               <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
//               {item.label}
//             </button>
//           )
//         })}

//         <button
//           onClick={onPartnerPortal}
//           style={{
//             margin: '8px 0', padding: '10px 12px',
//             backgroundColor: '#fff', border: '1px solid #DDD7C6',
//             borderRadius: 6, cursor: 'pointer',
//             display: 'flex', alignItems: 'center', gap: 10, width: '100%',
//             textAlign: 'left',
//           }}
//         >
//           <div style={{
//             width: 28, height: 28, borderRadius: 6,
//             backgroundColor: '#F5E0CC', color: '#6F2F0E',
//             display: 'flex', alignItems: 'center', justifyContent: 'center',
//             fontSize: 14,
//           }}>↗</div>
//           <div>
//             <div style={{ fontSize: 12, fontWeight: 600, color: '#161614' }}>Partner Portal</div>
//             <div style={{ fontSize: 10.5, color: '#6A675F', marginTop: 1 }}>See partner-side view</div>
//           </div>
//         </button>

//         <p style={{ fontSize: 10, color: '#A39F94', padding: '20px 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
//           Phase 2
//         </p>
//         <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', color: '#A39F94', fontSize: 13, cursor: 'not-allowed' }}>
//           <BarChart3 size={15} strokeWidth={1.5} />
//           Reports
//         </div>
//       </nav>

//       {/* User */}
//       <div style={{ padding: '12px 8px', borderTop: '1px solid #DDD7C6', display: 'flex', alignItems: 'center', gap: 10 }}>
//         <div style={{
//           width: 30, height: 30, borderRadius: '50%',
//           backgroundColor: '#1E3A6B', color: '#fff',
//           display: 'flex', alignItems: 'center', justifyContent: 'center',
//           fontSize: 11.5, fontWeight: 600,
//         }}>RM</div>
//         <div>
//           <div style={{ fontSize: 12.5, fontWeight: 600 }}>Rohan Mehta</div>
//           <div style={{ fontSize: 10.5, color: '#6A675F' }}>Sales · Industry</div>
//         </div>
//       </div>
//     </aside>
//   )
// }
import { useIsMobile } from '../hooks/useIsMobile'
import { LayoutGrid, Inbox, Plus, BarChart3, LayoutDashboard, User, Handshake, LogOut } from 'lucide-react'

type Page = 'home' | 'my-dashboard' | 'pipeline' | 'triage' | 'capture'

interface Props {
  current: Page
  navigate: (page: Page) => void
  role: string
  userName: string
  onLogout: () => void
  onPartnerPortal: () => void
}

interface NavItem {
  id: Page
  label: string
  short: string
  icon: typeof LayoutGrid
  /** If set, only these roles see the item. */
  roles?: string[]
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home',         label: 'Director view', short: 'Director', icon: LayoutDashboard, roles: ['director'] },
  { id: 'my-dashboard', label: 'My dashboard',  short: 'My view',  icon: User          },
  // CRM functions — hidden from supply_chain (they only need the capacity view)
  { id: 'pipeline',     label: 'Pipeline',      short: 'Pipeline', icon: LayoutGrid, roles: ['director', 'sales'] },
  { id: 'triage',       label: 'Triage queue',  short: 'Triage',   icon: Inbox,      roles: ['director', 'sales'] },
  { id: 'capture',      label: 'Capture lead',  short: 'Capture',  icon: Plus,       roles: ['director', 'sales'] },
]

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?'
}

function roleLabel(role: string): string {
  if (role === 'director') return 'Director'
  if (role === 'sales') return 'Sales'
  if (role === 'supply_chain') return 'Supply Chain'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export default function Sidebar({ current, navigate, role, userName, onLogout, onPartnerPortal }: Props) {
  const isMobile = useIsMobile()

  // Only show nav items this role is allowed to see
  const items = NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role))

  // Mobile — bottom nav bar
  if (isMobile) {
    return (
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: '#fff',
        borderTop: '1px solid #DDD7C6',
        display: 'flex',
        zIndex: 40,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {items.map(item => {
          const Icon = item.icon
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3,
                padding: '10px 2px 8px',
                background: 'none', border: 'none',
                cursor: 'pointer',
                color: active ? '#0E5550' : '#6A675F',
                position: 'relative',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute', top: 0, left: '20%', right: '20%',
                  height: 2, backgroundColor: '#0E5550',
                  borderRadius: '0 0 2px 2px',
                }} />
              )}
              <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
              <span style={{
                fontSize: 10, fontWeight: active ? 700 : 500,
                letterSpacing: '0.01em',
              }}>
                {item.short}
              </span>
            </button>
          )
        })}

        {/* Partner Portal — separate mode, not a page */}
        <button
          onClick={onPartnerPortal}
          style={{
            flex: 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 3,
            padding: '10px 2px 8px',
            background: 'none', border: 'none',
            cursor: 'pointer',
            color: '#6F2F0E',
            position: 'relative',
          }}
        >
          <Handshake size={20} strokeWidth={1.75} />
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.01em' }}>
            Partner
          </span>
        </button>
      </nav>
    )
  }

  // Desktop — sidebar
  return (
    <aside style={{
      width: 232,
      backgroundColor: '#EDE7D8',
      borderRight: '1px solid #DDD7C6',
      display: 'flex', flexDirection: 'column',
      padding: '22px 12px 16px',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '0 6px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em' }}>SGT</span>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#0E5550', letterSpacing: '-0.02em' }}>HydroEdge</span>
        </div>
        <div style={{ fontSize: 10, color: '#6A675F', marginTop: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
          Lead Service · v1
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1 }}>
        <p style={{ fontSize: 10, color: '#6A675F', padding: '0 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
          Workspace
        </p>
        {items.map(item => {
          const Icon = item.icon
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 9px', borderRadius: 5,
                backgroundColor: active ? '#fff' : 'transparent',
                color: active ? '#161614' : '#363633',
                fontSize: 13, fontWeight: active ? 600 : 500,
                textAlign: 'left', cursor: 'pointer', border: 'none',
                marginBottom: 1, position: 'relative',
              }}
            >
              {active && (
                <div style={{
                  position: 'absolute', left: 0, top: 6, bottom: 6,
                  width: 2.5, backgroundColor: '#0E5550', borderRadius: 2,
                }} />
              )}
              <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
              {item.label}
            </button>
          )
        })}

        <button
          onClick={onPartnerPortal}
          style={{
            margin: '8px 0', padding: '10px 12px',
            backgroundColor: '#fff', border: '1px solid #DDD7C6',
            borderRadius: 6, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            textAlign: 'left',
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            backgroundColor: '#F5E0CC', color: '#6F2F0E',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14,
          }}>↗</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#161614' }}>Partner Portal</div>
            <div style={{ fontSize: 10.5, color: '#6A675F', marginTop: 1 }}>See partner-side view</div>
          </div>
        </button>

        <p style={{ fontSize: 10, color: '#A39F94', padding: '20px 10px 6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
          Phase 2
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', color: '#A39F94', fontSize: 13, cursor: 'not-allowed' }}>
          <BarChart3 size={15} strokeWidth={1.5} />
          Reports
        </div>
      </nav>

      {/* User — logged-in account */}
      <div style={{ padding: '12px 8px 0', borderTop: '1px solid #DDD7C6', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          backgroundColor: '#1E3A6B', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11.5, fontWeight: 600, flexShrink: 0,
        }}>
          {initials(userName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {userName}
          </div>
          <div style={{ fontSize: 10.5, color: '#6A675F' }}>{roleLabel(role)}</div>
        </div>
        <button
          onClick={onLogout}
          title="Log out"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6A675F', padding: 4, display: 'flex', flexShrink: 0,
          }}
        >
          <LogOut size={15} strokeWidth={2} />
        </button>
      </div>
    </aside>
  )
}