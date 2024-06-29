#pragma once
#include "common/interface/iunknown.h"
#include "common/interface/iweakreference.h"

#define GENERATE_OBJECT_BODY()                                                                                         \
    template<class T, class... Args> friend ObjectPtr<T> CreateObject(Args&&...);                                      \
                                                                                                                       \
private:                                                                                                               \
    void* operator new(size_t size)                                                                                    \
    {                                                                                                                  \
        return ::operator new(size);                                                                                   \
    }                                                                                                                  \
    void operator delete(void* ptr)                                                                                    \
    {                                                                                                                  \
        ::operator delete(ptr);                                                                                        \
    }                                                                                                                  \
    void* operator new[](size_t size) = delete;                                                                        \
    void operator delete[](void* ptr) = delete;

namespace tsstg
{
    template<class T> class ObjectPtr
    {
        T* mPtr;

    public:
        ObjectPtr()
        {
            mPtr = nullptr;
        }

        ObjectPtr(T* ptr) : ObjectPtr()
        {
            mPtr = ptr;
            if (mPtr)
            {
                mPtr->AddRef();
            }
        }

        ObjectPtr(const ObjectPtr<T>& val) noexcept : ObjectPtr()
        {
            mPtr = val.mPtr;
            if (mPtr)
            {
                mPtr->AddRef();
            }
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        ObjectPtr(const ObjectPtr<TP>& val) noexcept : ObjectPtr()
        {
            if (val)
            {
                val->QueryInterface(GUID_OF(T), reinterpret_cast<void**>(&mPtr));
            }
        }

        ObjectPtr(ObjectPtr<T>&& val) noexcept
            : ObjectPtr()
        {
            mPtr = val.mPtr;
            val.mPtr = nullptr;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        ObjectPtr(ObjectPtr<TP>&& val) noexcept : ObjectPtr()
        {
            if (val)
            {
                val->QueryInterface(GUID_OF(T), reinterpret_cast<void**>(&mPtr));
                val.Reset();
            }
        }

        ~ObjectPtr()
        {
            Reset();
        }

        ObjectPtr<T>& operator=(const ObjectPtr<T>& val)
        {
            T* oldPtr = mPtr;
            mPtr = val.mPtr;
            if (mPtr)
            {
                mPtr->AddRef();
            }
            if (oldPtr)
            {
                oldPtr->Release();
            }
            return *this;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        ObjectPtr<T>& operator=(const ObjectPtr<TP>& val)
        {
            T* oldPtr = mPtr;
            mPtr = nullptr;
            if (val)
            {
                val->QueryInterface(GUID_OF(T), reinterpret_cast<void**>(&mPtr));
            }
            if (oldPtr)
            {
                oldPtr->Release();
            }
            return *this;
        }

        ObjectPtr<T>&
        operator=(T* val)
        {
            T* oldPtr = mPtr;
            mPtr = val;
            if (mPtr)
            {
                mPtr->AddRef();
            }
            if (oldPtr)
            {
                oldPtr->Release();
            }
            return *this;
        }

        friend bool operator!=(const ObjectPtr<T>& lhs, const ObjectPtr<T>& rhs)
        {
            return !(lhs.mPtr == rhs.mPtr);
        }

        friend bool operator!=(T* lhs, const ObjectPtr<T>& rhs)
        {
            return !(lhs == rhs.mPtr);
        }

        friend bool operator!=(const ObjectPtr<T>& lhs, T* rhs)
        {
            return !(lhs.mPtr == rhs);
        }

        friend bool operator==(const ObjectPtr<T>& lhs, T* rhs)
        {
            return lhs.mPtr == rhs;
        }

        friend bool operator==(T* lhs, const ObjectPtr<T>& rhs)
        {
            return lhs == rhs.mPtr;
        }

        friend bool operator==(const ObjectPtr<T>& lhs, const ObjectPtr<T>& rhs)
        {
            return (lhs.mPtr == rhs.mPtr);
        }

        friend bool operator<(const ObjectPtr<T>& lhs, const ObjectPtr<T>& rhs)
        {
            return (lhs.mPtr < rhs.mPtr);
        }

        inline T** operator&()
        {
            Reset();
            return &mPtr;
        }

        inline bool IsValid() const
        {
            return mPtr != nullptr;
        }

        inline operator bool() const
        {
            return IsValid();
        }

        inline T* operator->() const
        {
            return mPtr;
        }

        inline T* Get() const
        {
            return mPtr;
        }

        template<class TP> bool As(TP** val)
        {
            if (!mPtr)
            {
                *val = nullptr;
                return false;
            }

            if (mPtr->QueryInterface(GUID_OF(TP), reinterpret_cast<void**>(val)))
            {
                return true;
            }

            *val = dynamic_cast<TP*>(mPtr);
            if (*val)
            {
                mPtr->AddRef();
                return true;
            }
            return false;
        }

        template<class TP> ObjectPtr<TP> Cast()
        {
            ObjectPtr<TP> ptr;
            this->As(&ptr);
            return ptr;
        }

        void Reset()
        {
            if (mPtr)
            {
                mPtr->Release();
            }
            mPtr = nullptr;
        }
    };

    template<class T> class WeakPtr
    {
        IWeakReference* mReference;

    public:
        WeakPtr()
        {
            mReference = nullptr;
        }

        WeakPtr(T* ptr) : WeakPtr()
        {
            if (ptr)
            {
                ptr->GetWeakReference(&mReference);
            }
        }

        WeakPtr(const WeakPtr<T>& val) noexcept
        {
            mReference = val.mReference;
            if (mReference)
            {
                mReference->AddRef();
            }
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        WeakPtr(const WeakPtr<TP>& val) noexcept : WeakPtr()
        {
            mReference = val.mReference;
            if (mReference)
            {
                mReference->AddRef();
            }
        }

        WeakPtr(const ObjectPtr<T>& val) noexcept
            : WeakPtr()
        {
            if (val)
            {
                val->GetWeakReference(&mReference);
            }
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        WeakPtr(const ObjectPtr<TP>& val) noexcept : WeakPtr()
        {
            if (val)
            {
                val->GetWeakReference(&mReference);
            }
        }

        WeakPtr(WeakPtr<T>&& val) noexcept
            : WeakPtr()
        {
            mReference = val.mReference;
            val.mReference = nullptr;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        WeakPtr(WeakPtr<TP>&& val) noexcept : WeakPtr()
        {
            mReference = val.mReference;
            val.mReference = nullptr;
        }

        ~WeakPtr()
        {
            if (mReference)
            {
                mReference->Release();
            }
            mReference = nullptr;
        }

        WeakPtr<T>& operator=(const WeakPtr<T>& val)
        {
            T* oldRef = mReference;
            mReference = val.mReference;
            if (mReference)
            {
                mReference->AddRef();
            }
            if (oldRef)
            {
                oldRef->Release();
            }
            return *this;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        WeakPtr<T>& operator=(const WeakPtr<TP>& val)
        {
            T* oldRef = mReference;
            mReference = val.mReference;
            if (mReference)
            {
                mReference->AddRef();
            }
            if (oldRef)
            {
                oldRef->Release();
            }
            return *this;
        }

        WeakPtr<T>&
        operator=(T* val)
        {
            T* oldRef = mReference;
            mReference = nullptr;
            if (val)
            {
                val->GetWeakReference(&mReference);
            }
            if (oldRef)
            {
                oldRef->Release();
            }
            return *this;
        }

        WeakPtr<T>& operator=(const ObjectPtr<T>& val)
        {
            T* oldRef = mReference;
            mReference = nullptr;
            if (val)
            {
                val->GetWeakReference(&mReference);
            }
            if (oldRef)
            {
                oldRef->Release();
            }
            return *this;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        WeakPtr<T>& operator=(const ObjectPtr<TP>& val)
        {
            T* oldRef = mReference;
            mReference = nullptr;
            if (val)
            {
                val->GetWeakReference(&mReference);
            }
            if (oldRef)
            {
                oldRef->Release();
            }
            return *this;
        }

        friend bool
        operator!=(const WeakPtr<T>& lhs, const WeakPtr<T>& rhs)
        {
            return !(lhs.Lock() == rhs.Lock());
        }

        friend bool operator!=(T* lhs, const WeakPtr<T>& rhs)
        {
            return !(lhs == rhs.Lock());
        }

        friend bool operator!=(const WeakPtr<T>& lhs, T* rhs)
        {
            return !(lhs.Lock() == rhs);
        }

        friend bool operator==(const WeakPtr<T>& lhs, T* rhs)
        {
            return lhs.Lock() == rhs;
        }

        friend bool operator==(T* lhs, const WeakPtr<T>& rhs)
        {
            return lhs == rhs.Lock();
        }

        friend bool operator==(const WeakPtr<T>& lhs, const WeakPtr<T>& rhs)
        {
            return (lhs.Lock() == rhs.Lock());
        }

        friend bool operator<(const WeakPtr<T>& lhs, const WeakPtr<T>& rhs)
        {
            return (lhs.Lock() < rhs.Lock());
        }

        inline bool IsValid() const
        {
            return mReference != nullptr && Lock().IsValid();
        }

        inline operator bool() const
        {
            return IsValid();
        }

        inline ObjectPtr<T> Lock() const
        {
            ObjectPtr<IUnknown> ptr;
            if (mReference)
            {
                mReference->Resolve(GUID_OF(IUnknown), reinterpret_cast<void**>(&ptr));
            }
            return ptr.Cast<T>();
        }

        void Reset()
        {
            if (mReference)
            {
                mReference->Release();
            }
            mReference = nullptr;
        }
    };

    DEFINE_CLASS_GUID_ANONYMOUS(Object)
    class Object : public virtual IUnknown, public virtual IWeakReferenceSource
    {
        template<class T, class... Args> friend ObjectPtr<T> CreateObject(Args&&...);

    private:
        ObjectPtr<IWeakReference> mWeakRef;
        std::atomic_uint32_t mRef;

    public:
        Object();
        ~Object();
        Object(const Object&) = delete;
        Object(Object&&) = delete;
        Object& operator=(const Object&) = delete;
        Object& operator=(Object&&) = delete;

        uint32_t AddRef() override;
        uint32_t Release() override;
        bool QueryInterface(const GUID& guid, void** ppv) override;
        bool GetWeakReference(IWeakReference** ppv) override;

    private:
        void* operator new(size_t size)
        {
            return ::operator new(size);
        }
        void operator delete(void* ptr)
        {
            ::operator delete(ptr);
        }
        void* operator new[](size_t size) = delete;
        void operator delete[](void* ptr) = delete;
    };

    template<class T, class... Args> ObjectPtr<T> CreateObject(Args&&... args)
    {
        return new T(std::forward<Args>(args)...);
    }
} // namespace tsstg