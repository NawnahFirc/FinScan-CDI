import React from 'react'
export default class ErrorBoundary extends React.Component {
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(error){console.error('FinScan view failed:',error)}
  render(){
    if(this.state.failed) return <div className="card" role="alert"><h2>This view could not be displayed</h2><p>Your reviewed statements remain in the workspace. Return to Upload to check the source figures.</p><button className="btn primary" onClick={this.props.onRecover}>Return to Upload</button></div>
    return this.props.children
  }
}
