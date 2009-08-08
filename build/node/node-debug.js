YUI.add('node-base', function(Y) {

/**
 * The Node Utility provides a DOM-like interface for interacting with DOM nodes.
 * @module node
 * @submodule node-base
 */    

/**
 * The Node class provides a wrapper for manipulating DOM Nodes.
 * Node properties can be accessed via the set/get methods.
 * Use Y.get() to retrieve Node instances.
 *
 * <strong>NOTE:</strong> Node properties are accessed using
 * the <code>set</code> and <code>get</code> methods.
 *
 * @class Node
 * @constructor
 * @for Node
 */

// "globals"
var g_nodes = {},
    g_nodelists = {},
    g_slice = Array.prototype.slice,

    DOT = '.',
    NODE_NAME = 'nodeName',
    NODE_TYPE = 'nodeType',
    OWNER_DOCUMENT = 'ownerDocument',
    TAG_NAME = 'tagName',
    UID = '_yuid',

    Node = function(node) {
        var uid = node[UID];

        if (uid && g_nodes[uid] && g_nodes[uid] !== node) {
            node[UID] = null; // unset existing uid to prevent collision (via clone or hack)
        }

        this._initPlugins();

        uid = Y.stamp(node);
        if (!uid) { // stamp failed; likely IE non-HTMLElement
            uid = Y.guid();
        }

        this[UID] = uid;
        this._conf = {};

        g_nodes[uid] = node;
        this._node = node;
        this._stateProxy = node;
        Node._instances[uid] = this;
    },

    // used with previous/next/ancestor tests
    _wrapFn = function(fn) {
        var ret = null;
        if (fn) {
            ret = (typeof fn === 'string') ?
            function(n) {
                return Y.Selector.test(n, fn);
            } : 
            function(n) {
                return fn(Node.get(n));
            };
        }

        return ret;
    };
// end "globals"

Node.NAME = 'Node';

Node.re_aria = /^(?:role$|aria-)/;

Node.DOM_EVENTS = {
    abort: true,
    beforeunload: true,
    blur: true,
    change: true,
    click: true,
    close: true,
    command: true,
    contextmenu: true,
    drag: true,
    dragstart: true,
    dragenter: true,
    dragover: true,
    dragleave: true,
    dragend: true,
    drop: true,
    dblclick: true,
    error: true,
    focus: true,
    keydown: true,
    keypress: true,
    keyup: true,
    load: true,
    mousedown: true,
    mousemove: true,
    mouseout: true, 
    mouseover: true, 
    mouseup: true,
    mousemultiwheel: true,
    mousewheel: true,
    submit: true,
    mouseenter: true,
    mouseleave: true,
    scroll: true,
    reset: true,
    resize: true,
    select: true,
    textInput: true,
    unload: true
};

// Add custom event adaptors to this list.  This will make it so
// that delegate, key, available, contentready, etc all will
// be available through Node.on
Y.mix(Node.DOM_EVENTS, Y.Env.evt.plugins);

Node._instances = {};

/**
 * Registers plugins to be instantiated at the class level (plugins 
 * which should be plugged into every instance of Node by default).
 *
 * @method Node.plug
 * @static
 *
 * @param {Function | Array} plugin Either the plugin class, an array of plugin classes or an array of objects (with fn and cfg properties defined)
 * @param {Object} config (Optional) If plugin is the plugin class, the configuration for the plugin
 */
Node.plug = function() {
    var args = g_slice.call(arguments, 0);
    args.unshift(Node);
    Y.Plugin.Host.plug.apply(Y.Base, args);
    return Node;
};

/**
 * Unregisters any class level plugins which have been registered by the Node
 *
 * @method Node.unplug
 * @static
 *
 * @param {Function | Array} plugin The plugin class, or an array of plugin classes
 */
Node.unplug = function() {
    var args = g_slice.call(arguments, 0);
    args.unshift(Node);
    Y.Plugin.Host.unplug.apply(Y.Base, args);
    return Node;
};

/**
 * Retrieves the DOM node bound to a Node instance
 * @method Node.getDOMNode
 * @static
 *
 * @param {Y.Node || HTMLNode} node The Node instance or an HTMLNode
 * @return {HTMLNode} The DOM node bound to the Node instance.  If a DOM node is passed
 * as the node argument, it is simply returned.
 */
Node.getDOMNode = function(node) {
    if (node) {
        return (node.nodeType) ? node : node._node || null;
    }
    return null;
};
 
Node.scrubVal = function(val, node) {
    if (node && val) { // only truthy values are risky
        if (typeof val === 'object' || typeof val === 'function') { // safari nodeList === function
            if (NODE_TYPE in val || Y.DOM.isWindow(val)) {// node || window
                val = Node.get(val);
            } else if (val.item || // dom collection or Node instance
                    (val[0] && val[0][NODE_TYPE])) { // array of DOM Nodes
                val = Y.all(val);
            }
        }
    } else if (val === undefined) {
        val = node; // for chaining
    }

    return val;
};

Node.addMethod = function(name, fn, context) {
    if (name && fn && typeof fn === 'function') {
        Node.prototype[name] = function() {
            context = context || this;
            var args = g_slice.call(arguments),
                ret;

            if (args[0] && args[0] instanceof Node) {
                args[0] = args[0]._node;
            }

            if (args[1] && args[1] instanceof Node) {
                args[1] = args[1]._node;
            }
            args.unshift(this._node);
            ret = Node.scrubVal(fn.apply(context, args), this);
            return ret;
        };
    } else {
        Y.log('unable to add method: ' + name, 'warn', 'Node');
    }
};

Node.importMethod = function(host, name, altName) {
    if (typeof name === 'string') {
        altName = altName || name;
        Node.addMethod(altName, host[name], host);
    } else {
        Y.each(name, function(n) {
            Node.importMethod(host, n);
        });
    }
};

/**
 * Returns a single Node instance bound to the node or the
 * first element matching the given selector.
 * @method Y.get
 * @static
 * @param {String | HTMLElement} node a node or Selector 
 * @param {Y.Node || HTMLElement} doc an optional document to scan. Defaults to Y.config.doc. 
 */
Node.get = function(node, doc) {
    var instance = null,
        cachedNode,
        uid;

    if (node) {
        if (typeof node === 'string') {
            if (node.indexOf('doc') === 0) { // doc OR document
                node = Y.config.doc;
            } else if (node.indexOf('win') === 0) { // win OR window
                node = Y.config.win;
            } else {
                node = Y.Selector.query(node, doc, true);
            }
            if (!node) {
                return null;
            }
        } else if (node instanceof Node) {
            return node; // NOTE: return
        }

        uid = node._yuid;
        instance = Node._instances[uid]; // reuse exising instances
        cachedNode = instance ? instance._node : null;
        if (!instance || (cachedNode && node !== cachedNode)) { // new Node when nodes don't match
            instance = new Node(node);
        }
    }
    return instance;
};

/**
 * Creates a new dom node using the provided markup string. 
 * @method create
 * @static
 * @param {String} html The markup used to create the element
 * @param {HTMLDocument} doc An optional document context 
 */
Node.create = function() {
    return Node.get(Y.DOM.create.apply(Y.DOM, arguments));
};

Node.ATTRS = {
    /**
     * Allows for getting and setting the text of an element.
     * Formatting is preserved and special characters are treated literally.
     * @config text
     * @type String
     */
    text: {
        getter: function() {
            return Y.DOM.getText(this._node);
        },

        setter: function(content) {
            Y.DOM.setText(this._node, content);
            return content;
        }
    },

    'options': {
        getter: function() {
            return this.getElementsByTagName('option');
        }
    },

    /**
     * Returns a NodeList instance of all HTMLElement children.
     * @readOnly
     * @config children
     * @type NodeList
     */
    'children': {
        getter: function() {
            var node = this._node,
                children = node.children,
                childNodes, i, len;

            if (!children) {
                childNodes = node.childNodes;
                children = [];

                for (i = 0, len = childNodes.length; i < len; ++i) {
                    if (childNodes[i][TAG_NAME]) {
                        children[children.length] = childNodes[i];
                    }
                }
            }
            return Y.all(children);
        }
    },

    value: {
        getter: function() {
            return Y.DOM.getValue(this._node);
        },

        setter: function(val) {
            Y.DOM.setValue(this._node, val);
            return val;
        }
    },

    getter: function() {
        return this._data;
    },

    setter: function(val) {
        this._data = val;
        return val;
    }
};

// call with instance context
Node.DEFAULT_SETTER = function(name, val) {
    var node = this._stateProxy,
        strPath;

    if (name.indexOf(DOT) > -1) {
        strPath = name;
        name = name.split(DOT);
        // only allow when defined on node
        Y.Object.setValue(node, name, val);
    } else if (node[name] !== undefined) { // pass thru DOM properties 
        node[name] = val;
    }

    return val;
};

// call with instance context
Node.DEFAULT_GETTER = function(name) {
    var node = this._stateProxy,
        val;

    if (name.indexOf && name.indexOf(DOT) > -1) {
        val = Y.Object.getValue(node, name.split(DOT));
    } else if (node[name] !== undefined) { // pass thru from DOM
        val = node[name];
    }

    return val ? Y.Node.scrubVal(val, this) : val;
};

Y.augment(Node, Y.Event.Target);
Y.augment(Node, Y.Plugin.Host);

Y.mix(Node.prototype, {
    toString: function() {
        var str = '',
            errorMsg = this[UID] + ': not bound to a node',
            node = this._node;

        if (node) {
            str += node[NODE_NAME];
            if (node.id) {
                str += '#' + node.id; 
            }

            if (node.className) {
                str += '.' + node.className.replace(' ', '.'); 
            }

            // TODO: add yuid?
            str += ' ' + this[UID];
        }
        return str || errorMsg;
    },

    get: function(attr) {
        var attrConfig = Node.ATTRS[attr],
            val;

        if (attrConfig && attrConfig.getter) {
            val = attrConfig.getter.call(this);
        } else if (Node.re_aria.test(attr)) {
            val = this._node.getAttribute(attr, 2); 
        } else {
            val = Node.DEFAULT_GETTER.apply(this, arguments);
        }

        return val;
    },

    set: function(attr, val) {
        var attrConfig = Node.ATTRS[attr];

        if (attrConfig && attrConfig.setter) {
            attrConfig.setter.call(this, val);
        } else if (Node.re_aria.test(attr)) {
            this._node.setAttribute(attr, val);
        } else {
            Node.DEFAULT_SETTER.apply(this, arguments);
        }

        return this;
    },

    /**
     * Creates a new Node using the provided markup string. 
     * @method create
     * @param {String} html The markup used to create the element
     * @param {HTMLDocument} doc An optional document context 
     */
    create: Node.create,

    /**
     * Compares nodes to determine if they match.
     * Node instances can be compared to each other and/or HTMLElements.
     * @method compareTo
     * @param {HTMLElement | Node} refNode The reference node to compare to the node.
     * @return {Boolean} True if the nodes match, false if they do not. 
     */
    compareTo: function(refNode) {
        var node = this._node;
        if (refNode instanceof Y.Node) { 
            refNode = refNode._node;
        }
        return node === refNode;
    },

    /**
     * Determines whether the node is appended to the document.
     * @method inDoc
     * @param {Node|HTMLElement} doc optional An optional document to check against.
     * Defaults to current document. 
     * @return {Boolean} Whether or not this node is appended to the document. 
     */
    inDoc: function(doc) {
        var node = this._node;
        doc = (doc) ? doc._node || doc : node[OWNER_DOCUMENT];
        if (doc.documentElement) {
            return Y.DOM.contains(doc.documentElement, node);
        }
    },

    getById: function(id) {
        var node = this._node,
            ret = Y.DOM.byId(id, node[OWNER_DOCUMENT]);
        if (ret && Y.DOM.contains(node, ret)) {
            ret = Y.get(ret);
        } else {
            ret = null;
        }
        return ret;
    },

   /**
     * Returns the nearest ancestor that passes the test applied by supplied boolean method.
     * @method ancestor
     * @param {String | Function} fn A selector string or boolean method for testing elements.
     * If a function is used, it receives the current node being tested as the only argument.
     * @return {Node} The matching Node instance or null if not found
     */
    ancestor: function(fn) {
        return Node.get(Y.DOM.elementByAxis(this._node, 'parentNode', _wrapFn(fn)));
    },

    /**
     * Returns the previous matching sibling. 
     * Returns the nearest element node sibling if no method provided.
     * @method previous
     * @param {String | Function} fn A selector or boolean method for testing elements.
     * If a function is used, it receives the current node being tested as the only argument.
     * @return {Node} Node instance or null if not found
     */
    previous: function(fn, all) {
        return Node.get(Y.DOM.elementByAxis(this._node, 'previousSibling', _wrapFn(fn), all));
    }, 

    /**
     * Returns the next matching sibling. 
     * Returns the nearest element node sibling if no method provided.
     * @method next
     * @param {String | Function} fn A selector or boolean method for testing elements.
     * If a function is used, it receives the current node being tested as the only argument.
     * @return {Node} Node instance or null if not found
     */
    next: function(node, fn, all) {
        return Node.get(Y.DOM.elementByAxis(this._node, 'nextSibling', _wrapFn(fn), all));
    },
        
    /**
     * Retrieves a Node instance of nodes based on the given CSS selector. 
     * @method query
     *
     * @param {string} selector The CSS selector to test against.
     * @return {Node} A Node instance for the matching HTMLElement.
     */
    query: function(selector) {
        return Y.get(Y.Selector.query(selector, this._node, true));
    },

    /**
     * Retrieves a nodeList based on the given CSS selector. 
     * @method queryAll
     *
     * @param {string} selector The CSS selector to test against.
     * @return {NodeList} A NodeList instance for the matching HTMLCollection/Array.
     */
    queryAll: function(selector) {
        return Y.all(Y.Selector.query(selector, this._node));
    },

    // TODO: allow fn test
    /**
     * Test if the supplied node matches the supplied selector.
     * @method test
     *
     * @param {string} selector The CSS selector to test against.
     * @return {boolean} Whether or not the node matches the selector.
     */
    test: function(selector) {
        return Y.Selector.test(this._node, selector);
    },

    /**
     * Removes the node from its parent.
     * Shortcut for myNode.get('parentNode').removeChild(myNode);
     * @method remove
     * @chainable
     *
     */
    remove: function() {
        var node = this._node;
        node.parentNode.removeChild(node);
        return this;
    },

    /**
     * Invokes a method on the Node instance 
     * @method invoke
     * @param {String} method The name of the method to invoke
     * @param {Any}  a, b, c, etc. Arguments to invoke the method with. 
     * @return Whatever the underly method returns. 
     * DOM Nodes and Collections return values
     * are converted to Node/NodeList instances.
     *
     */
    invoke: function(method, a, b, c, d, e) {
        var node = this._node,
            ret;

        if (a && a instanceof Y.Node) {
            a = a._node;
        }

        if (b && b instanceof Y.Node) {
            b = b._node;
        }

        ret = node[method](a, b, c, d, e);    
        return Y.Node.scrubVal(ret, this);
    },

    destructor: function() {
        // TODO: What about shared instances?
        //var uid = this[UID];

        //delete g_nodes[uid];
        //delete Node._instances[uid];
    },

    /**
     * Applies the given function to each Node in the NodeList.
     * @method each
     * @deprecated Use NodeList
     * @param {Function} fn The function to apply 
     * @param {Object} context optional An optional context to apply the function with
     * Default context is the NodeList instance
     * @chainable
     */
    each: function(fn, context) {
        context = context || this;
        Y.log('each is deprecated on Node', 'warn', 'Node');
        return fn.call(context, this);
    },

    /**
     * Retrieves the Node instance at the given index. 
     * @method item
     * @deprecated Use NodeList
     *
     * @param {Number} index The index of the target Node.
     * @return {Node} The Node instance at the given index.
     */
    item: function(index) {
        Y.log('item is deprecated on Node', 'warn', 'Node');
        return this;
    },

    /**
     * Returns the current number of items in the Node.
     * @method size
     * @deprecated Use NodeList
     * @return {Int} The number of items in the Node. 
     */
    size: function() {
        Y.log('size is deprecated on Node', 'warn', 'Node');
        return this._node ? 1 : 0;
    },

    /**
     * Inserts the content before the reference node. 
     * @method insert
     * @param {String | Y.Node | HTMLElement} content The content to insert 
     * @param {Int | Y.Node | HTMLElement | String} where The position to insert at.
     * @chainable
     */
    insert: function(content, where) {
        if (content) {
            if (typeof where === 'number') { // allow index
                where = this._node.childNodes[where];
            }

            if (content._node) {
                content = content._node;
            }
            Y.DOM.addHTML(this._node, content, where);
        }
        return this;
    },

    /**
     * Inserts the content as the firstChild of the node. 
     * @method prepend
     * @param {String | Y.Node | HTMLElement} content The content to insert 
     * @chainable
     */
    prepend: function(content) {
        return this.insert(content, 0);
    },

    /**
     * Inserts the content as the lastChild of the node. 
     * @method append
     * @param {String | Y.Node | HTMLElement} content The content to insert 
     * @chainable
     */
    append: function(content) {
        return this.insert(content, null);
    },

    /**
     * Replaces the node's current content with the content.
     * @method setContent
     * @param {String | Y.Node | HTMLElement} content The content to insert 
     * @chainable
     */
    setContent: function(content) {
        Y.DOM.addHTML(this._node, content, 'replace');
        return this;
    },

    // TODO: need this?
    hasMethod: function(method) {
        var node = this._node;
        return (node && (typeof node === 'function'));
    }
}, true);

Y.Node = Node;
Y.get = Y.Node.get;
Y.first = Y.Node.get;
/**
 * The NodeList module provides support for managing collections of Nodes.
 * @module node
 * @submodule nodelist
 */    

/**
 * The NodeList class provides a wrapper for manipulating DOM NodeLists.
 * NodeList properties can be accessed via the set/get methods.
 * Use Y.all() to retrieve NodeList instances.
 *
 * @class NodeList
 * @constructor
 */

Y.Array._diff = function(a, b) {
    var removed = [],
        present = false,
        i, j, lenA, lenB;

    outer:
    for (i = 0, lenA = a.length; i < lenA; i++) {
        present = false;
        for (j = 0, lenB = b.length; j < lenB; j++) {
            if (a[i] === b[j]) {
                present = true;
                continue outer;
            }
        }
        if (!present) {
            removed[removed.length] = a[i];
        }
    }
    return removed;
};

Y.Array.diff = function(a, b) {
    return {
        added: Y.Array._diff(b, a),
        removed: Y.Array._diff(a, b)
    }; 
};

var NodeList = function(config) {
    var nodes = config.nodes || [],
        doc = config.doc || Y.config.doc;

    if (typeof nodes === 'string') {
        this._query = nodes;
        nodes = Y.Selector.query(nodes, doc);
    }

    Y.stamp(this);
    NodeList._instances[this[UID]] = this;
    g_nodelists[this[UID]] = nodes;
};
// end "globals"

NodeList.NAME = 'NodeList';

/**
 * Retrieves the DOM nodes bound to a NodeList instance
 * @method NodeList.getDOMNodes
 * @static
 *
 * @param {Y.NodeList} node The NodeList instance
 * @return {Array} The array of DOM nodes bound to the NodeList
 */
NodeList.getDOMNodes = function(nodeList) {
    return g_nodelists[nodeList[UID]];
};

NodeList._instances = [];

NodeList.each = function(instance, fn, context) {
    var nodes = g_nodelists[instance[UID]];
    if (nodes && nodes.length) {
        Y.Array.each(nodes, fn, context || instance);
    } else {
        Y.log('no nodes bound to ' + this, 'warn', 'NodeList');
    }
};

NodeList.addMethod = function(name, fn, context) {
    var tmp = NodeList._getTempNode();
    if (name && fn) {
        NodeList.prototype[name] = function() {
            var ret = [],
                args = arguments;

            Y.Array.each(g_nodelists[this[UID]], function(node) {
                var UID = '_yuid',
                    instance = Y.Node._instances[node[UID]],
                    ctx,
                    result;

                if (!instance) {
                    g_nodes[tmp[UID]] = node;
                    instance = tmp;
                }
                ctx = context || instance;
                result = fn.apply(ctx, args);
                if (result !== undefined && result !== instance) {
                    ret[ret.length] = result;
                }
            });

            // TODO: remove tmp pointer
            return ret.length ? ret : this;
        };
    } else {
        Y.log('unable to add method: ' + name, 'warn', 'Node');
    }
};

NodeList.importMethod = function(host, name, altName) {
    if (typeof name === 'string') {
        altName = altName || name;
        NodeList.addMethod(name, host[name]);
    } else {
        Y.each(name, function(n) {
            NodeList.importMethod(host, n);
        });
    }
};

NodeList._getTempNode = function() {
    var tmp = NodeList._tempNode;
        if (!tmp) {
            tmp = Y.Node.create('<div></div>');
            NodeList._tempNode = tmp;
        }
    return tmp;
};

Y.mix(NodeList.prototype, {
    /**
     * Retrieves the Node instance at the given index. 
     * @method item
     *
     * @param {Number} index The index of the target Node.
     * @return {Node} The Node instance at the given index.
     */
    item: function(index) {
        return Y.get((g_nodelists[this[UID]] || [])[index]);
    },

    /**
     * Applies the given function to each Node in the NodeList.
     * @method each
     * @param {Function} fn The function to apply. It receives 3 arguments:
     * the current node instance, the node's index, and the NodeList instance
     * @param {Object} context optional An optional context to apply the function with
     * Default context is the current Node instance
     * @chainable
     */
    each: function(fn, context) {
        var instance = this;
        Y.Array.each(g_nodelists[this[UID]], function(node, index) {
            node = Y.get(node);
            return fn.call(context || node, node, index, instance);
        });
        return instance;
    },

    batch: function(fn, context) {
        var nodelist = this,
            tmp = NodeList._getTempNode();

        Y.Array.each(g_nodelists[this[UID]], function(node, index) {
            var instance = Y.Node._instances[node[UID]];
            if (!instance) {
                g_nodes[tmp[UID]] = node;
                instance = tmp;
            }

            return fn.call(context || instance, instance, index, nodelist);
        });
        return nodelist;
    },

    /**
     * Executes the function once for each node until a true value is returned.
     * @method some
     * @param {Function} fn The function to apply. It receives 3 arguments:
     * the current node instance, the node's index, and the NodeList instance
     * @param {Object} context optional An optional context to execute the function from.
     * Default context is the current Node instance
     * @return {Boolean} Whether or not the function returned true for any node.
     */
    some: function(fn, context) {
        var instance = this;
        return Y.Array.some(g_nodelists[this[UID]], function(node, index) {
            node = Y.get(node);
            context = context || node;
            return fn.call(context, node, index, instance);
        });
    },

    /**
     * Returns the index of the node in the NodeList instance
     * or -1 if the node isn't found.
     * @method indexOf
     * @param {Y.Node || DOMNode} node the node to search for
     * @return {Int} the index of the node value or -1 if not found
     */
    indexOf: function(node) {
        return Y.Array.indexOf(g_nodelists[this[UID]], Y.Node.getDOMNode(node));
    },

    /**
     * Filters the NodeList instance down to only nodes matching the given selector.
     * @method filter
     * @param {String} selector The selector to filter against
     * @return {NodeList} NodeList containing the updated collection 
     * @see Selector
     */
    filter: function(selector) {
        return Y.all(Y.Selector.filter(g_nodelists[this[UID]], selector));
    },

    modulus: function(n, r) {
        r = r || 0;
        var nodes = [];
        NodeList.each(this, function(node, i) {
            if (i % n === r) {
                nodes.push(node);
            }
        });

        return Y.all(nodes);
    },

    /**
     * Creates a new NodeList containing all nodes at odd indices
     * (zero-based index).
     * @method odd
     * @return {NodeList} NodeList containing the updated collection 
     */
    odd: function() {
        return this.modulus(2, 1);
    },

    /**
     * Creates a new NodeList containing all nodes at even indices
     * (zero-based index), including zero. 
     * @method even
     * @return {NodeList} NodeList containing the updated collection 
     */
    even: function() {
        return this.modulus(2);
    },

    destructor: function() {
        delete NodeList._instances[this[UID]];
    },

    refresh: function() {
        var doc,
            diff,
            oldList = g_nodelists[this[UID]];
        if (this._query) {
            if (g_nodelists[this[UID]] &&
                    g_nodelists[this[UID]][0] && 
                    g_nodelists[this[UID]][0].ownerDocument) {
                doc = g_nodelists[this[UID]][0].ownerDocument;
            }

            g_nodelists[this[UID]] = Y.Selector.query(this._query, doc || Y.config.doc);        
            diff = Y.Array.diff(oldList, g_nodelists[this[UID]]); 
            diff.added = diff.added ? Y.all(diff.added) : null;
            diff.removed = diff.removed ? Y.all(diff.removed) : null;
            this.fire('refresh', diff);
        }
        return this;
    },

    /**
     * Applies an event listener to each Node bound to the NodeList. 
     * @method on
     * @param {String} type The event being listened for
     * @param {Function} fn The handler to call when the event fires
     * @param {Object} context The context to call the handler with.
     * Default is the NodeList instance. 
     * @return {Object} Returns an event handle that can later be use to detach(). 
     * @see Event.on
     */
    on: function(type, fn, context) {
        context = context || this;
        this.batch(function(node) {
            node.on.call(node, type, fn, context);
        });
    },

    /**
     * Applies an event listener to each Node bound to the NodeList. 
     * The handler is called only after all on() handlers are called
     * and the event is not prevented.
     * @method after
     * @param {String} type The event being listened for
     * @param {Function} fn The handler to call when the event fires
     * @param {Object} context The context to call the handler with.
     * Default is the NodeList instance. 
     * @return {Object} Returns an event handle that can later be use to detach(). 
     * @see Event.on
     */
    after: function(type, fn, context) {
        context = context || this;
        this.batch(function(node) {
            node.after.call(node, type, fn, context);
        });
    },

    /**
     * Returns the current number of items in the NodeList.
     * @method size
     * @return {Int} The number of items in the NodeList. 
     */
    size: function() {
        return g_nodelists[this[UID]].length;
    },

    /** Called on each Node instance
      * @get
      * @see Node
      */
    // one-off because we cant import from Node due to undefined return values
    get: function(name) {
        var ret = [],
            tmp = NodeList._getTempNode();

        NodeList.each(this, function(node) {
            var instance = Y.Node._instances[node[UID]];
            if (!instance) {
                g_nodes[tmp[UID]] = node;
                instance = tmp;
            }
            ret[ret.length] = instance.get(name);
        });

        return ret;
    },

    toString: function() {
        var str = '',
            errorMsg = this[UID] + ': not bound to any nodes',
            nodes = g_nodelists[this[UID]],
            node;

        if (nodes && nodes[0]) {
            node = nodes[0];
            str += node[NODE_NAME];
            if (node.id) {
                str += '#' + node.id; 
            }

            if (node.className) {
                str += '.' + node.className.replace(' ', '.'); 
            }

            if (nodes.length > 1) {
                str += '...[' + nodes.length + ' items]';
            }
        }
        return str || errorMsg;
    }

}, true);

NodeList.importMethod(Y.Node.prototype, [
    /**
     * Called on each Node instance
     * @for NodeList
     * @method append
     * @see Node.append
     */
    'append',

    /**
      * Called on each Node instance
      * @method detach
      * @see Node.detach
      */
    'detach',
    
    /** Called on each Node instance
      * @method detachAll
      * @see Node.detachAll
      */
    'detachAll',

    /** Called on each Node instance
      * @method insert
      * @see NodeInsert
      */
    'insert',

    /** Called on each Node instance
      * @method plug
      * @see Node.plug
      */
    'plug',

    /** Called on each Node instance
      * @method prepend
      * @see Node.prepend
      */
    'prepend',

    /** Called on each Node instance
      * @method remove
      * @see Node.remove
      */
    'remove',

    /** Called on each Node instance
      * @method set
      * @see Node.set
      */
    'set',

    /** Called on each Node instance
      * @method setContent
      * @see Node.setContent
      */
    'setContent',

    /** Called on each Node instance
      * @method unplug
      * @see Node.unplug
      */
    'unplug'
]);

Y.NodeList = NodeList;
Y.all = function(nodes, doc, restrict) {
    // TODO: propagate restricted to nodes?
    var nodeList = new NodeList({
        nodes: nodes,
        doc: doc
    });

    // zero-length result returns null
    return nodeList;
};
Y.Node.all = Y.all; // TODO: deprecated
Y.Array.each([
    /**
     * Passes through to DOM method.
     * @method replaceChild
     * @for Node
     * @param {HTMLElement | Node} node Node to be inserted 
     * @param {HTMLElement | Node} refNode Node to be replaced 
     * @return {Node} The replaced node 
     */
    'replaceChild',

    /**
     * Passes through to DOM method.
     * @method appendChild
     * @param {HTMLElement | Node} node Node to be appended 
     * @return {Node} The appended node 
     */
    'appendChild',

    /**
     * Passes through to DOM method.
     * @method insertBefore
     * @param {HTMLElement | Node} newNode Node to be appended 
     * @param {HTMLElement | Node} refNode Node to be inserted before 
     * @return {Node} The inserted node 
     */
    'insertBefore',

    /**
     * Passes through to DOM method.
     * @method removeChild
     * @param {HTMLElement | Node} node Node to be removed 
     * @return {Node} The removed node 
     */
    'removeChild',

    /**
     * Passes through to DOM method.
     * @method hasChildNodes
     * @return {Boolean} Whether or not the node has any childNodes 
     */
    'hasChildNodes',

    /**
     * Passes through to DOM method.
     * @method cloneNode
     * @param {Boolean} deep Whether or not to perform a deep clone, which includes
     * subtree and attributes
     * @return {Node} The clone 
     */
    'cloneNode',

    /**
     * Passes through to DOM method.
     * @method hasAttribute
     * @param {String} attribute The attribute to test for 
     * @return {Boolean} Whether or not the attribute is present 
     */
    'hasAttribute',

    /**
     * Passes through to DOM method.
     * @method removeAttribute
     * @param {String} attribute The attribute to be removed 
     * @chainable
     */
    'removeAttribute',

    /**
     * Passes through to DOM method.
     * @method scrollIntoView
     * @chainable
     */
    'scrollIntoView',

    /**
     * Passes through to DOM method.
     * @method getElementsByTagName
     * @param {String} tagName The tagName to collect 
     * @return {NodeList} A NodeList representing the HTMLCollection
     */
    'getElementsByTagName',

    /**
     * Passes through to DOM method.
     * @method focus
     * @chainable
     */
    'focus',

    /**
     * Passes through to DOM method.
     * @method blur
     * @chainable
     */
    'blur',

    /**
     * Passes through to DOM method.
     * Only valid on FORM elements
     * @method submit
     * @chainable
     */
    'submit',

    /**
     * Passes through to DOM method.
     * Only valid on FORM elements
     * @method reset
     * @chainable
     */
    'reset',

    /**
     * Passes through to DOM method.
     * @method select
     * @chainable
     */
     'select'
], function(method) {
    Y.Node.prototype[method] = function(arg1, arg2, arg3) {
        var ret = this.invoke(method, arg1, arg2, arg3);
        return ret;
    };
});

Node.importMethod(Y.DOM, [
    /**
     * Determines whether the ndoe is an ancestor of another HTML element in the DOM hierarchy.
     * @method contains
     * @param {Node | HTMLElement} needle The possible node or descendent
     * @return {Boolean} Whether or not this node is the needle its ancestor
     */
    'contains',
    /**
     * Allows setting attributes on DOM nodes, normalizing in some cases.
     * This passes through to the DOM node, allowing for custom attributes.
     * @method setAttribute
     * @for Node
     * @for NodeList
     * @chainable
     * @param {string} name The attribute name 
     * @param {string} value The value to set
     */
    'setAttribute',
    /**
     * Allows getting attributes on DOM nodes, normalizing in some cases.
     * This passes through to the DOM node, allowing for custom attributes.
     * @method getAttribute
     * @for Node
     * @for NodeList
     * @param {string} name The attribute name 
     * @return {string} The attribute value 
     */
    'getAttribute'
]);

if (!document.documentElement.hasAttribute) { // IE < 8
    Y.Node.prototype.hasAttribute = function(attr) {
        return Y.DOM.getAttribute(Y.Node.getDOMNode(this), attr) !== '';
    };
}

/**
 * Allows setting attributes on DOM nodes, normalizing in some cases.
 * This passes through to the DOM node, allowing for custom attributes.
 * @method setAttribute
 * @see Node
 * @for NodeList
 * @chainable
 * @param {string} name The attribute name 
 * @param {string} value The value to set
 */

/**
 * Allows getting attributes on DOM nodes, normalizing in some cases.
 * This passes through to the DOM node, allowing for custom attributes.
 * @method getAttribute
 * @see Node
 * @for NodeList
 * @param {string} name The attribute name 
 * @return {string} The attribute value 
 */
Y.NodeList.importMethod(Y.Node.prototype, ['getAttribute', 'setAttribute']);
(function(Y) {
    var methods = [
    /**
     * Determines whether each node has the given className.
     * @method hasClass
     * @for Node
     * @param {String} className the class name to search for
     * @return {Array} An array of booleans for each node bound to the NodeList. 
     */
     'hasClass',

    /**
     * Adds a class name to each node.
     * @method addClass         
     * @param {String} className the class name to add to the node's class attribute
     * @chainable
     */
     'addClass',

    /**
     * Removes a class name from each node.
     * @method removeClass         
     * @param {String} className the class name to remove from the node's class attribute
     * @chainable
     */
     'removeClass',

    /**
     * Replace a class with another class for each node.
     * If no oldClassName is present, the newClassName is simply added.
     * @method replaceClass  
     * @param {String} oldClassName the class name to be replaced
     * @param {String} newClassName the class name that will be replacing the old class name
     * @chainable
     */
     'replaceClass',

    /**
     * If the className exists on the node it is removed, if it doesn't exist it is added.
     * @method toggleClass  
     * @param {String} className the class name to be toggled
     * @chainable
     */
     'toggleClass'
    ];

    Y.Node.importMethod(Y.DOM, methods);
    /**
     * Determines whether each node has the given className.
     * @method hasClass
     * @see Node.hasClass
     * @for NodeList
     * @param {String} className the class name to search for
     * @return {Array} An array of booleans for each node bound to the NodeList. 
     */

    /**
     * Adds a class name to each node.
     * @method addClass         
     * @see Node.addClass
     * @param {String} className the class name to add to the node's class attribute
     * @chainable
     */

    /**
     * Removes a class name from each node.
     * @method removeClass         
     * @see Node.removeClass
     * @param {String} className the class name to remove from the node's class attribute
     * @chainable
     */

    /**
     * Replace a class with another class for each node.
     * If no oldClassName is present, the newClassName is simply added.
     * @method replaceClass  
     * @see Node.replaceClass
     * @param {String} oldClassName the class name to be replaced
     * @param {String} newClassName the class name that will be replacing the old class name
     * @chainable
     */

    /**
     * If the className exists on the node it is removed, if it doesn't exist it is added.
     * @method toggleClass  
     * @see Node.toggleClass
     * @param {String} className the class name to be toggled
     * @chainable
     */
    Y.NodeList.importMethod(Y.Node.prototype, methods);
})(Y);
/**
 * Functionality to make the node a delegated event container
 * @module node
 * @submodule node-event-delegate
 */

/**
 * Functionality to make the node a delegated event container
 * @method delegate
 * @param type {String} the event type to delegate
 * @param fn {Function} the function to execute
 * @param selector {String} a selector that must match the target of the event.
 * @return {Event.Handle} the detach handle
 * @for Node
 */
Y.Node.prototype.delegate = function(type, fn, selector, context) {
    context = context || this;
    var args = Array.prototype.slice.call(arguments, 4),
        a = ['delegate', fn, Y.Node.getDOMNode(this), type, selector, context];
    a = a.concat(args);
    return Y.on.apply(Y, a);
};



}, '@VERSION@' ,{requires:['dom-base', 'event-custom', 'selector-css2']});
YUI.add('node-style', function(Y) {

(function(Y) {
/**
 * Extended Node interface for managing node styles.
 * @module node
 * @submodule node-style
 */

var methods = [
    /**
     * Returns the style's current value.
     * @method getStyle
     * @for Node
     * @param {String} attr The style attribute to retrieve. 
     * @return {String} The current value of the style property for the element.
     */
    'getStyle',

    /**
     * Returns the computed value for the given style property.
     * @method getComputedStyle
     * @param {String} attr The style attribute to retrieve. 
     * @return {String} The computed value of the style property for the element.
     */
    'getComputedStyle',

    /**
     * Sets a style property of the node.
     * @method setStyle
     * @param {String} attr The style attribute to set. 
     * @param {String|Number} val The value. 
     * @chainable
     */
    'setStyle',

    /**
     * Sets multiple style properties on the node.
     * @method setStyles
     * @param {Object} hash An object literal of property:value pairs. 
     * @chainable
     */
    'setStyles'
];
Y.Node.importMethod(Y.DOM, methods);
/**
 * Returns an array of values for each node.
 * @method getStyle
 * @for NodeList
 * @see Node.getStyle
 * @param {String} attr The style attribute to retrieve. 
 * @return {Array} The current values of the style property for the element.
 */

/**
 * Returns an array of the computed value for each node.
 * @method getComputedStyle
 * @see Node.getComputedStyle
 * @param {String} attr The style attribute to retrieve. 
 * @return {Array} The computed values for each node.
 */

/**
 * Sets a style property on each node.
 * @method setStyle
 * @see Node.setStyle
 * @param {String} attr The style attribute to set. 
 * @param {String|Number} val The value. 
 * @chainable
 */

/**
 * Sets multiple style properties on each node.
 * @method setStyles
 * @see Node.setStyles
 * @param {Object} hash An object literal of property:value pairs. 
 * @chainable
 */
Y.NodeList.importMethod(Y.Node.prototype, methods);
})(Y);


}, '@VERSION@' ,{requires:['dom-style', 'node-base']});
YUI.add('node-screen', function(Y) {

/**
 * Extended Node interface for managing regions and screen positioning.
 * Adds support for positioning elements and normalizes window size and scroll detection. 
 * @module node
 * @submodule node-screen
 */

// these are all "safe" returns, no wrapping required
Y.each([
    /**
     * Returns the inner width of the viewport (exludes scrollbar). 
     * @config winWidth
     * @for Node
     * @type {Int}
     */
    'winWidth',

    /**
     * Returns the inner height of the viewport (exludes scrollbar). 
     * @config winHeight
     * @type {Int}
     */
    'winHeight',

    /**
     * Document width 
     * @config winHeight
     * @type {Int}
     */
    'docWidth',

    /**
     * Document height 
     * @config docHeight
     * @type {Int}
     */
    'docHeight',

    /**
     * Amount page has been scroll vertically 
     * @config docScrollX
     * @type {Int}
     */
    'docScrollX',

    /**
     * Amount page has been scroll horizontally 
     * @config docScrollY
     * @type {Int}
     */
    'docScrollY'
    ],
    function(name) {
        Y.Node.ATTRS[name] = {
            getter: function() {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(Y.Node.getDOMNode(this));

                return Y.DOM[name].apply(this, args);
            }
        };
    }
);

Y.Node.ATTRS.scrollLeft = {
    getter: function() {
        var node = Y.Node.getDOMNode(this);
        return ('scrollLeft' in node) ? node.scrollLeft : Y.DOM.docScrollX(node);
    },

    setter: function(val) {
        var node = Y.Node.getDOMNode(this);
        if (node) {
            if ('scrollLeft' in node) {
                node.scrollLeft = val;
            } else if (node.document || node.nodeType === 9) {
                Y.DOM._getWin(node).scrollTo(val, Y.DOM.docScrollY(node)); // scroll window if win or doc
            }
        } else {
            Y.log('unable to set scrollLeft for ' + node, 'error', 'Node');
        }
    }
};

Y.Node.ATTRS.scrollTop = {
    getter: function() {
        var node = Y.Node.getDOMNode(this);
        return ('scrollTop' in node) ? node.scrollTop : Y.DOM.docScrollY(node);
    },

    setter: function(val) {
        var node = Y.Node.getDOMNode(this);
        if (node) {
            if ('scrollTop' in node) {
                node.scrollTop = val;
            } else if (node.document || node.nodeType === 9) {
                Y.DOM._getWin(node).scrollTo(Y.DOM.docScrollX(node), val); // scroll window if win or doc
            }
        } else {
            Y.log('unable to set scrollTop for ' + node, 'error', 'Node');
        }
    }
};

Y.Node.importMethod(Y.DOM, [
/**
 * Gets the current position of the node in page coordinates. 
 * @method getXY
 * @for Node
 * @return {Array} The XY position of the node
*/
    'getXY',

/**
 * Set the position of the node in page coordinates, regardless of how the node is positioned.
 * @method setXY
 * @param {Array} xy Contains X & Y values for new position (coordinates are page-based)
 * @chainable
 */
    'setXY',

/**
 * Gets the current position of the node in page coordinates. 
 * @method getX
 * @return {Int} The X position of the node
*/
    'getX',

/**
 * Set the position of the node in page coordinates, regardless of how the node is positioned.
 * @method setX
 * @param {Int} x X value for new position (coordinates are page-based)
 * @chainable
 */
    'setX',

/**
 * Gets the current position of the node in page coordinates. 
 * @method getY
 * @return {Int} The Y position of the node
*/
    'getY',

/**
 * Set the position of the node in page coordinates, regardless of how the node is positioned.
 * @method setY
 * @param {Int} y Y value for new position (coordinates are page-based)
 * @chainable
 */
    'setY'
]);

/**
 * Returns a region object for the node 
 * @config region
 * @for Node
 * @type Node
 */
Y.Node.ATTRS.region = {
    getter: function() {
        var node = Y.Node.getDOMNode(this);
        if (node && !node.tagName) {
            if (node.nodeType === 9) { // document
                node = node.documentElement;
            } else if (node.alert) { // window
                node = node.document.documentElement;
            }
        }
        return Y.DOM.region(node);
    }
};
    
/**
 * Returns a region object for the node's viewport 
 * @config viewportRegion
 * @type Node
 */
Y.Node.ATTRS.viewportRegion = {
    getter: function() {
        return Y.DOM.viewportRegion(Y.Node.getDOMNode(this));
    }
};

Y.Node.importMethod(Y.DOM, 'inViewportRegion');

// these need special treatment to extract 2nd node arg
/**
 * Compares the intersection of the node with another node or region 
 * @method intersect         
 * @for Node
 * @param {Node|Object} node2 The node or region to compare with.
 * @param {Object} altRegion An alternate region to use (rather than this node's). 
 * @return {Object} An object representing the intersection of the regions. 
 */
Y.Node.prototype.intersect = function(node2, altRegion) {
    var node1 = Y.Node.getDOMNode(this);
    if (node2 instanceof Y.Node) { // might be a region object
        node2 = Y.Node.getDOMNode(node2);
    }
    return Y.DOM.intersect(node1, node2, altRegion); 
};

/**
 * Determines whether or not the node is within the giving region.
 * @method inRegion         
 * @param {Node|Object} node2 The node or region to compare with.
 * @param {Boolean} all Whether or not all of the node must be in the region. 
 * @param {Object} altRegion An alternate region to use (rather than this node's). 
 * @return {Object} An object representing the intersection of the regions. 
 */
Y.Node.prototype.inRegion = function(node2, all, altRegion) {
    var node1 = Y.Node.getDOMNode(this);
    if (node2 instanceof Y.Node) { // might be a region object
        node2 = Y.Node.getDOMNode(node2);
    }
    return Y.DOM.inRegion(node1, node2, all, altRegion); 
};


}, '@VERSION@' ,{requires:['dom-screen']});


YUI.add('node', function(Y){}, '@VERSION@' ,{use:['node-base', 'node-style', 'node-screen'], skinnable:false, requires:['dom']});

