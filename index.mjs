import { writable, derived, get as readStore } from "svelte/store";
export default function(origins, derive, reflect, initial) {
	var originValues, allowReflect = true, allowDerive = true;
	var childWritable = writable(initial);
	var childWritableSetter = childWritable.set;
	var sendDownstream = (value) => {
		allowReflect = false;
		childWritableSetter(value);
		allowReflect = true;
	};
	var wrappedDerive = (got, set) => {
		originValues = got;
		if (allowDerive) {
			let returned = derive(got, sendDownstream);
			if (derive.length < 2) {
				sendDownstream(returned);
			} else {
				return returned;
			}
		}
	};
	var childDerived = derived(origins, wrappedDerive);
	
	var singleOrigin = !Array.isArray(origins), unsubscribeFromDerived;
	var sendUpstream = (setWith) => {
		allowDerive = false;
		if (singleOrigin) {
			origins.set(setWith);
		} else {
			setWith.forEach( (value, i) => {
				origins[i].set(value);
			} );
		}
		allowDerive = true;
	};
	var cleanup = null;
	allowReflect = false;
	childWritable.subscribe((value) => {
		if (allowReflect) {
			if (cleanup) {
				cleanup();
				cleanup = null;
			}
			
			let isAsync = false;
			let returned = reflect({
				reflecting: value,
				get old() {
					// We need an active subscription to childDerived for originValues to be usable
					if (unsubscribeFromDerived) {
						return originValues;
					} else {
						if (singleOrigin) {
							return readStore(origins);
						} else {
							return origins.map(readStore);
						}
					}
				},
				get set() {
					isAsync = true;
					return sendUpstream;
				},
			});
			if (isAsync) {
				if (typeof returned == "function") {
					cleanup = returned;
				}
			} else {
				sendUpstream(returned);
			}
		}
	});
	allowReflect = true;
	function listen() {
		unsubscribeFromDerived = childDerived.subscribe( () => {} );
	}
	function unlisten() {
		unsubscribeFromDerived();
		originValues = unsubscribeFromDerived = undefined;
	}
	
	var subscriberCount = 0;
	var me = {
		subscribe(subscriber) {
			++subscriberCount;
			if (subscriberCount == 1) { listen(); }
			var unsubscribe = childWritable.subscribe(subscriber);
			return () => {
				unsubscribe();
				--subscriberCount;
				if (subscriberCount == 0) { unlisten(); }
			};
		},
		set: childWritable.set,
		update(fn) {
			if (subscriberCount == 0) {
				// guarantee up-to-date value
				listen(), unlisten();
			}
			childWritable.update(fn);
		},
	};
	return me;
}