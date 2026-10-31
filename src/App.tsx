import { Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './lib/store'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Chat } from './pages/Chat'
import { Admin, Alerts, Announcements, Channels, Home, KudosPage, Notifications, People, Search } from './pages/Misc'

function Routed() {
  const { me, loading, rank } = useApp()
  if (loading) return <div className="flex h-full items-center justify-center text-slate-500">Loading…</div>
  if (!me) return <Login />
  if (!me.is_active) return <div className="p-10 text-center">Your account is deactivated. Contact an admin.</div>
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="c/:id" element={<Chat kind="channel" />} />
        <Route path="dm/:id" element={<Chat kind="dm" />} />
        <Route path="channels" element={<Channels />} />
        <Route path="people" element={<People />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="kudos" element={<KudosPage />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="search" element={<Search />} />
        {rank >= 90 && <Route path="admin" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  )
}

export default function App() { return <AppProvider><Routed /></AppProvider> }
