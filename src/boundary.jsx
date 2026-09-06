import { Component } from "react";

/* ONE BAD FIELD MUST NOT TAKE THE WHOLE SITE DOWN.
   React unmounts the entire tree when a render throws, so until now a single
   malformed value anywhere in the snapshot — a null where a number was assumed,
   a shape change from a schema bump that landed before the cron re-ran — turned
   the app into a white page for every visitor at once, with nothing on screen
   saying what happened. That is the highest-severity failure this codebase has,
   and it is also the cheapest to contain.

   The boundary is per-VIEW rather than per-app on purpose. The point is not to
   show a nicer crash; it is that the crash stays local — the shell, the nav and
   the other eight views keep working while the one that threw says so. A
   boundary around the whole tree would just be a prettier white page.

   `resetKey` is what makes it recoverable: when it changes (the view id, in
   practice) the boundary clears its error and tries again, so switching away
   from a broken view and back does not leave it permanently dead for the rest
   of the session.

   It reports the error text, because "something went wrong" is the same lie as
   a fabricated number — it tells the user nothing and it tells you nothing when
   they screenshot it. */
export class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidUpdate(prev) {
    if (this.state.err && prev.resetKey !== this.props.resetKey) this.setState({ err: null });
  }

  componentDidCatch(err, info) {
    // Kept to the console rather than sent anywhere: there is no error service
    // wired up, and inventing one silently would be worse than not having it.
    console.error(`[${this.props.label || "view"}] render failed`, err, info && info.componentStack);
  }

  render() {
    if (!this.state.err) return this.props.children;
    const msg = String(this.state.err && this.state.err.message ? this.state.err.message : this.state.err);
    return (
      <div className="wrap">
        <div className="boundary" role="alert">
          <h2 className="boundary-h">This view could not render.</h2>
          <p className="boundary-p">
            The rest of the terminal is unaffected — the other views, the nav and your saved
            watchlist and positions are all still there. Switching away and back will retry it.
          </p>
          <p className="boundary-p">
            It is almost always a shape the data took that the view did not expect. Nothing has
            been lost and nothing has been written.
          </p>
          <pre className="boundary-err">{msg}</pre>
          <button className="boundary-btn" onClick={() => this.setState({ err: null })}>Try again</button>
        </div>
      </div>
    );
  }
}
