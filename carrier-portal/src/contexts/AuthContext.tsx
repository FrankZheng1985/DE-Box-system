import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: string
  username: string
  name: string
  email: string
  userType: string
  linkedEntityId?: string
  company?: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
}

const AUTH_STORAGE_KEY = 'eu_tms_carrier_auth'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 检查本地存储的认证信息
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY)
    if (savedAuth) {
      try {
        const data = JSON.parse(savedAuth)
        if (data.token && data.user) {
          setToken(data.token)
          setUser(data.user)
        }
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, userType: 'CARRIER' }),
      })

      const data = await response.json()

      if (data.code === 200 && data.data) {
        const authData = {
          token: data.data.token,
          user: data.data.user,
        }
        setUser(authData.user)
        setToken(authData.token)
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData))
        return true
      }
      return false
    } catch (error) {
      console.error('登录失败:', error)
      return false
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
