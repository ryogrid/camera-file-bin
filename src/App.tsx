import { useState } from 'react'
import Sender from './components/Sender'
import Receiver from './components/Receiver'
import './App.css'

type Tab = 'send' | 'receive'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('send')

  return (
    <div className="App">
      <h1>QR Code File Transfer</h1>
      <div className="tab-container">
        <button
          className={`tab-button ${activeTab === 'send' ? 'active' : ''}`}
          onClick={() => setActiveTab('send')}
        >
          Send File
        </button>
        <button
          className={`tab-button ${activeTab === 'receive' ? 'active' : ''}`}
          onClick={() => setActiveTab('receive')}
        >
          Receive File
        </button>
      </div>
      <div className="content-container">
        {activeTab === 'send' ? <Sender /> : <Receiver />}
      </div>
    </div>
  )
}

export default App
